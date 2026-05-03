# Horizontal Scaling Readiness

This project is intended to stay on one production host for now while remaining ready to scale
`backend` and `web` replicas later through Docker Compose.

## Current Operating Mode

Keep production at one runtime replica until capacity requires otherwise:

```bash
BACKEND_REPLICAS=1
WEB_REPLICAS=1
```

Even in this mode, production should run through the same infrastructure path that multiple
replicas will use later:

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-random-secret>
APP_JWT_SECRET=<stable-base64-secret>
APP_E2EE_ESCROW_SECRET=<stable-base64-secret>
APP_PUSH_VAPID_PUBLIC_KEY=<stable-vapid-public-key>
APP_PUSH_VAPID_PRIVATE_KEY=<stable-vapid-private-key>
```

Do not rely on generated JWT, escrow, or VAPID secrets in production. Ephemeral secrets make
restarts and future replica rollout behave differently from normal operation.

## Already Prepared

- `backend` realtime events can be distributed through Redis Pub/Sub.
- auth endpoint rate limiting can use Redis instead of JVM-local memory.
- websocket session revocations are broadcast through signed Redis events when Redis realtime is enabled.
- typing state can use Redis instead of JVM memory.
- message send idempotency is enforced with `clientMessageId`.
- message ordering is backed by the database `server_order`.
- group/direct active history keys are server-managed and rotated outside the message hot path through maintenance outbox workers.
- identity reset and account-key regrant fan out through the same backend maintenance pipeline instead of requiring another live client.
- scheduled backend jobs use Postgres advisory locks.
- conference activation/start/end and recording import are handled by scheduled maintenance jobs,
  not by list/download read request paths.
- direct chat creation has a canonical user pair and a unique database index, so future replicas
  cannot create duplicate direct rooms for the same two users.
- `deploy/remote-update.sh` already reads `BACKEND_REPLICAS` and `WEB_REPLICAS`.

## Before Increasing Replicas

1. Confirm Redis realtime is enabled in the current one-replica production deployment.
2. Confirm Redis auth rate limiting is enabled or explicitly handled at the edge proxy.
3. Confirm all stable secrets are set in `.env.prod`.
4. Keep `APP_DB_MAX_POOL_SIZE` low enough that `BACKEND_REPLICAS * APP_DB_MAX_POOL_SIZE` fits
   Postgres headroom.
5. Confirm restore rehearsal exists for PostgreSQL together with `APP_E2EE_ESCROW_SECRET`; DB backup alone is insufficient for managed E2EE history recovery.
6. Run a smoke test covering:
   - health endpoint
   - login and refresh
   - direct chat creation
   - websocket message send and receive
   - typing indicator
   - delivered/read receipts
   - encrypted attachment upload and download
7. Review websocket logs for `/ws` spikes and `429` responses.
8. Review backend logs for slow message send, outbox lag, or grant rotation warnings.

## First Replica Increase

Use a small step first:

```bash
BACKEND_REPLICAS=2
WEB_REPLICAS=1
```

Then rerun the smoke test. Increase `WEB_REPLICAS` only after backend behavior is clean:

```bash
WEB_REPLICAS=2
```

## Single-Host Boundary

This readiness path assumes one Docker host.

The following services remain singleton services in the current topology:

- Postgres
- Redis
- Caddy edge
- bundled Jitsi services

Message attachments and conference recordings still use Docker volumes. That is acceptable on one
host because all backend replicas share the same local Docker volumes. Moving to multiple physical
hosts requires S3/MinIO-compatible object storage first.

## Remaining Hardening Items

These are useful before larger scale, but they are not required for staying at one runtime replica:

- add an automated production smoke-test script
- add a short websocket load-test script for pre-scale validation
- add explicit load checks for message dispatch outbox and E2EE maintenance outbox lag
