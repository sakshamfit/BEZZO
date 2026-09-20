#!/usr/bin/env python3
"""Proves a cash-on-delivery reservation is committed, not timed (migration 0017).

1. Place a COD order.
2. Its reservation must be CONFIRMED with a NULL expiry.
3. Force its expiry into the past and wait a full `reservations.expire` cycle (30 s cadence): nothing may
   be released, the order must stay confirmed, the stock must not move.
4. Cancel the order: the committed stock must return to the shelf.

Needs a running API, `DATABASE_URL` (read from `.env` when the environment does not set one) and a Node
`pg` module — resolved from `apps/api/node_modules`, which is why the SQL helper runs there. Takes ~60 s
because step 3 must wait for a real job cycle from the scheduler in the API process.
"""
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import urllib.error

REPO = pathlib.Path(__file__).resolve().parents[2]
BASE = f"{os.environ.get('BEZZO_API_URL', 'http://127.0.0.1:4000')}/api/v1"


def database_url() -> str:
    if os.environ.get('DATABASE_URL'):
        return os.environ['DATABASE_URL']
    env_file = REPO / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    sys.exit('DATABASE_URL is not set and could not be read from .env')


def call(method, path, token=None, body=None, headers=None):
    hdrs = {'Content-Type': 'application/json'}
    if token:
        hdrs['Authorization'] = f'Bearer {token}'
    if headers:
        hdrs.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or '{}')
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or '{}')


def sql(statement):
    """Runs one statement through a Node `pg` client (the repo's own driver) and returns rows."""
    out = subprocess.run(
        ['node', '-e', f"""
const {{ Client }} = require('pg');
(async () => {{
  const c = new Client({{ connectionString: process.env.VERIFY_DATABASE_URL }});
  await c.connect();
  const r = await c.query({json.dumps(statement)});
  console.log(JSON.stringify(r.rows));
  await c.end();
}})().catch((e) => {{ console.error(e.message); process.exit(1); }});
"""],
        cwd=str(REPO / 'apps' / 'api'),
        env={**os.environ, 'VERIFY_DATABASE_URL': database_url()},
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])


results = []


def check(label, condition, detail=''):
    results.append(condition)
    print(('PASS  ' if condition else 'FAIL  ') + label + (f'  — {detail}' if detail and not condition else ''))


stamp = int(time.time())
status, res = call('POST', '/auth/login', body={'identifier': 'buyer1@bezzo.local', 'password': 'Bezzo@12345'})
token = res['data']['accessToken']

call('DELETE', '/cart', token)
status, res = call('GET', '/catalog/products?limit=1', token)
product = res['data'][0]
status, res = call('GET', f"/catalog/products/{product['id']}", token)
offer = next(o for o in res['data']['offers'] if o['sellableQuantity'] > 5)
listing = offer['listingId']
inventory = sql(f"""SELECT i.id AS inventory_id, i.available_quantity, i.reserved_quantity
  FROM inventories i JOIN supplier_product_listings l ON l.id = i.supplier_listing_id
 WHERE l.id = '{listing}'""")[0]
before = int(inventory['reserved_quantity'])

status, res = call('POST', '/cart/items', token, {'supplierProductId': listing, 'quantity': 3},
                   {'Idempotency-Key': f'cod-cart-{stamp}'})
check('cart add', status == 201, f'{status} {res}')
status, res = call('GET', '/buyer/addresses', token)
address = (res['data'][0])['id']
status, res = call('POST', '/orders', token,
                   {'deliveryAddressId': address, 'deliveryMode': 'INSTANT', 'paymentMethod': 'COD'},
                   {'Idempotency-Key': f'cod-order-{stamp}'})
order = res['data']
order_id = order['id']
check('COD order confirmed at placement', order['status'] == 'CONFIRMED', order['status'])

reservation = sql(f"""SELECT id, status, expires_at FROM inventory_reservations WHERE order_id = '{order_id}'""")[0]
check('COD reservation is CONFIRMED with no expiry',
      reservation['status'] == 'CONFIRMED' and reservation['expires_at'] is None,
      json.dumps(reservation))

after_place = int(sql(f"SELECT reserved_quantity FROM inventories WHERE id = '{inventory['inventory_id']}'")[0]['reserved_quantity'])
check('stock is reserved at placement', after_place == before + 3, f'{before} -> {after_place}')

# Force the timer: even a reservation whose expiry is in the past must not be released while its order
# is confirmed. This is the regression the fix exists for.
sql(f"""UPDATE inventory_reservations SET expires_at = now() - interval '1 hour'
 WHERE order_id = '{order_id}'""")
print('      forced expiry into the past; waiting for reservations.expire (30 s cadence)…')
time.sleep(40)

after_wait = sql(f"""SELECT status, expires_at FROM inventory_reservations WHERE order_id = '{order_id}'""")[0]
order_after = sql(f"SELECT status FROM orders WHERE id = '{order_id}'")[0]['status']
stock_after = int(sql(f"SELECT reserved_quantity FROM inventories WHERE id = '{inventory['inventory_id']}'")[0]['reserved_quantity'])
check('expiry job left the committed reservation alone', after_wait['status'] == 'CONFIRMED', json.dumps(after_wait))
check('the confirmed order was not cancelled', order_after == 'CONFIRMED', order_after)
check('stock did not move back to the shelf', stock_after == before + 3, f'{before + 3} -> {stock_after}')

status, res = call('POST', f'/orders/{order_id}/cancel', token, {'reason': 'COD reservation check'},
                   {'Idempotency-Key': f'cod-cancel-{stamp}'})
check('cancelling the COD order succeeds', status in (200, 201), f'{status} {json.dumps(res)[:200]}')
final = sql(f"""SELECT status, released_at IS NOT NULL AS released FROM inventory_reservations WHERE order_id = '{order_id}'""")[0]
stock_final = int(sql(f"SELECT reserved_quantity FROM inventories WHERE id = '{inventory['inventory_id']}'")[0]['reserved_quantity'])
check('cancel released the committed reservation', final['status'] == 'RELEASED' and final['released'], json.dumps(final))
check('cancel returned the units', stock_final == before, f'{before} -> {stock_final}')

print()
print(f'{sum(1 for r in results if r)}/{len(results)} checks passed')
raise SystemExit(0 if all(results) else 1)
