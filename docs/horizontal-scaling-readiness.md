# Horizontal Scaling Readiness

## Current target

The project is intended to run on one production host while remaining ready to scale:

- `backend`
- `web`

through Docker Compose replicas.

## Recommended baseline

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-secret>
APP_JWT_SECRET=<stable-secret>
BACKEND_REPLICAS=1
WEB_REPLICAS=1
```

Do not rely on generated secrets in production.

## What is already prepared

- backend realtime fan-out can use Redis
- auth rate limiting can use Redis
- websocket session revocation can fan out through Redis
- scheduled backend jobs use Postgres advisory locks
- message send idempotency is enforced by `clientMessageId`
- ordering is persisted by `server_order`
- deploy scripts already read `BACKEND_REPLICAS` and `WEB_REPLICAS`

## Before increasing replicas

1. Confirm Redis-backed realtime is enabled.
2. Confirm stable secrets are set in `.env.prod`.
3. Confirm Postgres connection pool totals fit the server.
4. Run smoke checks for auth, direct chats, group chats, attachments, and receipts.
5. Review logs and metrics for dispatch lag and websocket errors.

## Boundaries

Still singleton or host-local:

- Postgres
- Redis
- Caddy edge
- bundled Jitsi services
- conference recording Docker volumes

Attachment blobs already target MinIO-backed object storage in the production compose stack.
Multi-host rollout still requires an object-storage strategy for conference recordings.
