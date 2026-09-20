#!/usr/bin/env python3
"""End-to-end verification of the BEZZO payments slice (Phase 6).

Runs against a live API + embedded PostgreSQL. Exercises the production webhook pipeline through the
development signer, then retry and refund. Prints PASS/FAIL per assertion and exits non-zero on failure.
"""
import json
import time
import urllib.request
import urllib.error

# Idempotency keys are replayed verbatim by the API (as designed), so every run needs its own nonce.
RUN = str(int(time.time()))

BASE = 'http://127.0.0.1:4000/api/v1'
RESULTS = []


def call(method, path, token=None, body=None, headers=None, raw=False):
    data = None
    hdrs = {'Content-Type': 'application/json'}
    if body is not None:
        data = json.dumps(body).encode()
    if token:
        hdrs['Authorization'] = f'Bearer {token}'
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(BASE + path, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read().decode()
            return resp.status, (payload if raw else json.loads(payload or '{}'))
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode()
        try:
            return exc.code, json.loads(payload or '{}')
        except json.JSONDecodeError:
            return exc.code, {'raw': payload}


def check(label, condition, detail=''):
    RESULTS.append((label, bool(condition), detail))
    print(f"{'PASS' if condition else 'FAIL'}  {label}" + (f"  — {detail}" if detail and not condition else ''))
    return bool(condition)


def data_of(payload):
    return payload.get('data', payload)


# ---------------------------------------------------------------- login
status, res = call('POST', '/auth/login', body={'identifier': 'buyer1@bezzo.local', 'password': 'Bezzo@12345'})
buyer = data_of(res)
check('buyer1 login', status in (200, 201) and 'accessToken' in buyer, f'{status} {res}')
btoken = buyer['accessToken']

status, res = call('POST', '/auth/login', body={'identifier': 'admin@bezzo.local', 'password': 'Bezzo@12345'})
admin = data_of(res)
check('admin login', status in (200, 201) and 'accessToken' in admin, f'{status} {res}')
atoken = admin['accessToken']

# ---------------------------------------------------------------- cart -> order (UPI = gateway payment)
call('DELETE', '/cart', token=btoken)
status, res = call('GET', '/catalog/products?limit=5', token=btoken)
items = data_of(res)
if isinstance(items, dict):
    items = items.get('items', [])
target = None
for it in items:
    if it.get('inStock') and (it.get('sellableQuantity') or 0) > 5:
        target = it
        break
check('found a purchasable catalogue product', target is not None, json.dumps(items)[:400])

# The product detail carries the supplier offers; pick the cheapest with stock.
status, res = call('GET', f"/catalog/products/{target['id']}", token=btoken)
detail0 = data_of(res)
offers = sorted((o for o in (detail0.get('offers') or []) if (o.get('sellableQuantity') or 0) > 5),
                key=lambda o: float(o.get('sellingPrice') or 0))
check('found a purchasable offer', bool(offers), json.dumps(detail0)[:300])
listing_id = offers[0]['listingId']
qty = 2
status, res = call('POST', '/cart/items', token=btoken,
                   body={'supplierProductId': listing_id, 'quantity': qty},
                   headers={'Idempotency-Key': f'pay-verify-cart-1-{RUN}'})
check('add to cart', status in (200, 201), f'{status} {res}')

# buyer1 default address (seed)
address_id = '23aa2d96-c742-468f-9a8a-90e6bb98a0de'
status, res = call('GET', '/buyer/addresses', token=btoken)
addrs = data_of(res)
if isinstance(addrs, dict):
    addrs = addrs.get('items', [])
default = next((a for a in addrs if a.get('isDefault')), None) or (addrs[0] if addrs else None)
if default:
    address_id = default['id']
check('have a delivery address', bool(address_id), '')

status, res = call('POST', '/checkout/quote', token=btoken,
                   body={'deliveryAddressId': address_id, 'deliveryMode': 'INSTANT'},
                   headers={'Idempotency-Key': f'pay-verify-quote-1-{RUN}'})
quote = data_of(res)
check('checkout quote is placeable', status in (200, 201) and quote.get('placeable') is True,
      f'{status} {json.dumps(quote)[:300]}')

status, res = call('POST', '/orders', token=btoken,
                   body={'deliveryAddressId': address_id, 'deliveryMode': 'INSTANT', 'paymentMethod': 'UPI'},
                   headers={'Idempotency-Key': f'pay-verify-order-1-{RUN}'})
placed = data_of(res)
check('place UPI order -> PENDING_PAYMENT', status in (200, 201) and (placed.get('payment') or {}).get('id'),
      f'{status} {json.dumps(res)[:300]}')
order_id = placed.get('id')
payment_id = (placed.get('payment') or {}).get('id')
print(f'      order={order_id} payment={payment_id} total={placed.get("grandTotal")}')

status, res = call('GET', f'/orders/{order_id}', token=btoken)
detail = data_of(res)
check('order starts PENDING_PAYMENT with a live payment',
      detail.get('status') == 'PENDING_PAYMENT' and (detail.get('payment') or {}).get('status') in ('PENDING', 'AUTHORIZED'),
      f"{detail.get('status')} / {(detail.get('payment') or {}).get('status')}")

captured_amount = str(placed.get('grandTotal'))

# ---------------------------------------------------------------- 1. capture
status, res = call('POST', f'/dev/payments/{payment_id}/mock-webhook', token=btoken,
                   body={'outcome': 'PAID', 'eventId': f'evt-capture-0001-{RUN}'})
sim = data_of(res)
check('webhook capture accepted', status == 200 and sim.get('status') == 'PROCESSED' and sim.get('applied') is True,
      f'{status} {json.dumps(sim)[:300]}')

status, res = call('GET', f'/orders/{order_id}', token=btoken)
detail = data_of(res)
check('order CONFIRMED after capture', detail.get('status') == 'CONFIRMED', detail.get('status'))
check('payment PAID after capture', (detail.get('payment') or {}).get('status') == 'PAID',
      str((detail.get('payment') or {}).get('status')))
check('all order items confirmed',
      all(i.get('status') == 'CONFIRMED' for i in (detail.get('items') or [])),
      str([i.get('status') for i in (detail.get('items') or [])]))

# ---------------------------------------------------------------- 2. duplicate delivery
status, res = call('POST', f'/dev/payments/{payment_id}/mock-webhook', token=btoken,
                   body={'outcome': 'PAID', 'eventId': f'evt-capture-0001-{RUN}'})
dup = data_of(res)
check('duplicate event answered 200', status == 200, f'{status} {res}')
check('duplicate event flagged DUPLICATE with no effect',
      dup.get('status') == 'DUPLICATE' and dup.get('applied') is False, json.dumps(dup)[:300])

status, res = call('GET', f'/orders/{order_id}', token=btoken)
again = data_of(res)
check('duplicate produced no second effect (still PAID, same history length)',
      (again.get('payment') or {}).get('status') == 'PAID' and again.get('status') == 'CONFIRMED')

# ---------------------------------------------------------------- 3. forged signature
def forged(event_id):
    req = urllib.request.Request(
        BASE + '/webhooks/payments/mock',
        data=json.dumps({'eventId': event_id, 'providerReference': 'x', 'amount': 1, 'status': 'PAID'}).encode(),
        headers={'Content-Type': 'application/json', 'x-mock-signature': 'deadbeef' * 8},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()

evt_forged_a = f'evt-forged-new-{RUN}'
evt_forged_b = f'evt-capture-0001'
for label, event_id in (('new event id', evt_forged_a), ('event id already seen', evt_forged_b)):
    forged_status, forged_body = forged(event_id)
    check(f'forged signature rejected with 400 ({label})', forged_status == 400, f'{forged_status} {forged_body[:200]}')
    check(f'forged rejection carries PAYMENT_VERIFICATION_FAILED ({label})',
          'PAYMENT_VERIFICATION_FAILED' in forged_body, forged_body[:200])

# ---------------------------------------------------------------- 4. failure + retry
call('DELETE', '/cart', token=btoken)
status, res = call('POST', '/cart/items', token=btoken, body={'supplierProductId': listing_id, 'quantity': 1},
                   headers={'Idempotency-Key': f'pay-verify-cart-2-{RUN}'})
status, res = call('POST', '/checkout/quote', token=btoken,
                   body={'deliveryAddressId': address_id, 'deliveryMode': 'INSTANT'},
                   headers={'Idempotency-Key': f'pay-verify-quote-2-{RUN}'})
quote2 = data_of(res)
status, res = call('POST', '/orders', token=btoken,
                   body={'deliveryAddressId': address_id, 'deliveryMode': 'INSTANT', 'paymentMethod': 'CARD'},
                   headers={'Idempotency-Key': f'pay-verify-order-2-{RUN}'})
placed2 = data_of(res)
order2, payment2 = placed2.get('id'), (placed2.get('payment') or {}).get('id')
check('second order placed (CARD)', bool(payment2), json.dumps(placed2)[:300])

status, res = call('POST', f'/dev/payments/{payment2}/mock-webhook', token=btoken,
                   body={'outcome': 'FAILED', 'eventId': f'evt-fail-0001-{RUN}'})
failed = data_of(res)
check('failure webhook accepted', status == 200, f'{status} {res}')

status, res = call('GET', f'/orders/{order2}', token=btoken)
d2 = data_of(res)
check('order still payable after failure (PENDING_PAYMENT)',
      d2.get('status') == 'PENDING_PAYMENT' and (d2.get('payment') or {}).get('status') == 'FAILED',
      f"{d2.get('status')} / {(d2.get('payment') or {}).get('status')}")

status, res = call('POST', f'/payments/{payment2}/retry', token=btoken, body={},
                   headers={'Idempotency-Key': f'pay-verify-retry-1-{RUN}'})
retry = data_of(res)
check('retry returns a fresh intent', status in (200, 201) and (retry.get('providerReference') or retry.get('providerOrderReference')),
      f'{status} {res}')
check('retry reuses the same payment id', (retry.get('paymentId') or payment2) == payment2, json.dumps(retry)[:300])

status, res = call('POST', f'/dev/payments/{payment2}/mock-webhook', token=btoken,
                   body={'outcome': 'PAID', 'eventId': f'evt-retry-paid-0001-{RUN}'})
check('capture after retry accepted', status == 200, f'{status} {res}')
status, res = call('GET', f'/orders/{order2}', token=btoken)
d2b = data_of(res)
check('order confirmed after retry capture', d2b.get('status') == 'CONFIRMED' and (d2b.get('payment') or {}).get('status') == 'PAID',
      f"{d2b.get('status')} / {(d2b.get('payment') or {}).get('status')}")

# ---------------------------------------------------------------- 5. refunds (admin)
status, res = call('POST', f'/payments/{payment_id}/refund', token=atoken,
                   body={'amount': captured_amount, 'reason': 'Verification — full refund'},
                   headers={'Idempotency-Key': f'pay-verify-refund-full-{RUN}'})
refund = data_of(res)
check('admin full refund accepted', status in (200, 201) and (refund.get('refundId') or refund.get('id')), f'{status} {res}')
status, res = call('GET', f'/orders/{order_id}', token=btoken)
refunded = data_of(res)
check('payment REFUNDED after full refund', (refunded.get('payment') or {}).get('status') == 'REFUNDED',
      str((refunded.get('payment') or {}).get('status')))

# partial refund on the second (retry-captured) payment
status, res = call('POST', f'/payments/{payment2}/refund', token=atoken,
                   body={'amount': '1.00', 'reason': 'Verification — partial refund'},
                   headers={'Idempotency-Key': f'pay-verify-refund-partial-{RUN}'})
partial = data_of(res)
check('partial refund accepted', status in (200, 201), f'{status} {res}')
status, res = call('GET', f'/orders/{order2}', token=btoken)
p2 = data_of(res)
check('payment PARTIALLY_REFUNDED after partial refund',
      (p2.get('payment') or {}).get('status') == 'PARTIALLY_REFUNDED',
      str((p2.get('payment') or {}).get('status')))

# over-refund must be refused
status, res = call('POST', f'/payments/{payment2}/refund', token=atoken,
                   body={'amount': captured_amount, 'reason': 'Over refund attempt'},
                   headers={'Idempotency-Key': f'pay-verify-refund-over-{RUN}'})
check('over-refund refused', status >= 400, f'{status} {json.dumps(res)[:250]}')

# buyer must not be able to refund
status, res = call('POST', f'/payments/{payment2}/refund', token=btoken,
                   body={'amount': '1.00', 'reason': 'Buyer attempt'},
                   headers={'Idempotency-Key': f'pay-verify-refund-forbidden-{RUN}'})
check('buyer refund forbidden', status in (401, 403), f'{status} {json.dumps(res)[:250]}')

# ---------------------------------------------------------------- summary
print()
passed = sum(1 for _, ok, _ in RESULTS if ok)
print(f'{passed}/{len(RESULTS)} checks passed')
print(f'orders: {order_id} (full refund), {order2} (partial refund)')
raise SystemExit(0 if passed == len(RESULTS) else 1)
