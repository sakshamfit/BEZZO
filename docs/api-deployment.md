# Deploying the BEZZO API

The Android app calls this NestJS API. Supabase supplies PostgreSQL; it does not host the API.
The root `Dockerfile` builds a runtime image without copying `.env`, database certificates, or local
secrets into the image.

## Build and run

```sh
docker build -t bezzo-api:release .
docker run --detach --name bezzo-api \
  --publish 4000:4000 \
  --env-file /secure/path/bezzo-api.env \
  --mount type=bind,src=/secure/path/prod-ca-2021.crt,dst=/run/secrets/postgres-ca.crt,readonly \
  bezzo-api:release
```

Terminate TLS at the selected hosting provider or a managed load balancer, route HTTPS traffic to port
4000, and configure its health check to use `/health/ready`. The container also probes `/health/live`.
Configure `API_PUBLIC_URL`, `CORS_ALLOWED_ORIGINS`, and the Android build URL to the resulting public
HTTPS host. Set `DATABASE_SSL=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, and
`DATABASE_SSL_CA_CERT_PATH=/run/secrets/postgres-ca.crt`; keep the CA file in the host's secret or
certificate store, not in Git or the container image.

## Runtime configuration

Use `.env.example` as the complete environment-variable inventory. `NODE_ENV=production` deliberately
fails closed unless the production checks pass. At minimum the current checks require:

- verified TLS to PostgreSQL and distinct strong `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and
  `AUTH_OTP_PEPPER` values;
- `REDIS_URL` with `REDIS_REQUIRED=true`;
- live Razorpay key ID, key secret, and webhook secret;
- enabled email and SMS notifications/workers, a verified Resend sender, and configured Twilio account,
  token, and sender;
- S3-compatible storage and explicit HTTPS CORS origins.

Supply all credentials directly through the host's secret manager. Never bake them into image build
arguments, source control, or a mobile APK. Rotate any database credential previously shared in chat
before connecting a public API to that database.

## Database and mobile release

Review the migration plan and database status before applying migrations to the intended Supabase
project. Do not run development seeds against production. Populate real supplier, buyer, and sealed-box
catalog data through authorized operations.

Only after the API is deployed and its health endpoint responds over HTTPS can the real app be built:

```sh
cd apps/mobile
flutter build apk --release \
  --dart-define=BEZZO_API_BASE_URL=https://api.example.com/api/v1
```

For a distributable signed APK, configure the Android upload keystore through CI secrets and sign the
release. Do not use the offline showcase mode for a real API build.
