# Production Runbook

## Goal

Keep deploys short, repeatable, and non-interactive.

## Recommended host setup

1. Create a dedicated `deploy` user.
2. Use SSH key authentication.
3. Keep `.env.prod` only on the server.
4. Use `/opt/messenger-app` as the checkout path.
5. Install Docker and Docker Compose.
6. Enable firewall and SSH hardening.

## Main scripts

- `deploy/deploy-prod-button.cmd`
- `deploy/deploy-prod-button.ps1`
- `deploy/remote-update.sh`
- `deploy/preflight-prod.sh`
- `deploy/bootstrap-prod-env.sh`
- `deploy/backup.sh`
- `deploy/install-backup-timer.sh`

## Deploy flow

Local operator trigger:

1. Copy `.env.deploy-button.example` to `.env.deploy-button`.
2. Fill `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_APP_DIR`, and `PROD_PUBLIC_BASE_URL`.
3. Double-click `deploy/deploy-prod-button.cmd` or run it from PowerShell.
4. The script uploads `deploy/remote-update.sh`, starts the remote rollout over SSH, tails the remote log, and verifies `build-meta.json`.

`deploy/remote-update.sh` does the following:

1. ensures the checkout is clean
2. fast-forwards `main`
3. bootstraps missing `.env.prod` defaults
4. runs production preflight
5. validates Docker Compose config
6. rebuilds `web`, `backend`, and `edge`
7. starts required support services
8. rolls `backend`, `web`, and `edge`
9. optionally manages observability services

Run by button from Windows:

```powershell
deploy\deploy-prod-button.cmd
```

Manual server-side run:

```bash
cd /opt/messenger-app
./deploy/remote-update.sh
```

Full reset from the button:

```powershell
deploy\deploy-prod-button.cmd -FullReset
```

Run preflight only:

```bash
cd /opt/messenger-app
bash deploy/preflight-prod.sh .env.prod
```

## Full reset

If you need a fresh deployment from scratch:

```bash
FULL_RESET=true ./deploy/remote-update.sh
```

This removes named volumes and is destructive for server-side state.

## Required services

Core production stack:

- `postgres`
- `redis`
- `minio`
- `backend`
- `web`
- `edge`

Optional self-hosted conference stack:

- `jitsi-prosody`
- `jitsi-jicofo`
- `jitsi-jvb`
- `jitsi-web`

If you want the self-hosted Jitsi containers, override `SUPPORT_SERVICES` when running `remote-update.sh`.

## Scaling

Single-host scaling is supported for `backend` and `web`.

Recommended production values:

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-secret>
APP_JWT_SECRET=<stable-secret>
BACKEND_REPLICAS=2
WEB_REPLICAS=2
```

Current limitations:

- Postgres and Redis are still singleton in this topology
- conference recordings still use Docker volumes
- multi-host rollout still requires object storage for conference recordings

Attachment transfer path:

- edge proxies `/storage/*` to the internal `minio` service
- `APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_PUBLIC_ENDPOINT` must match that public path, for example `https://your-domain.example/storage`

## Push notifications

Set stable VAPID keys in `.env.prod` before relying on Web Push:

```bash
APP_PUSH_ENABLED=true
APP_PUSH_SUBJECT=mailto:no-reply@your-domain.example
APP_PUSH_VAPID_PUBLIC_KEY=<public-key>
APP_PUSH_VAPID_PRIVATE_KEY=<private-key>
```

The backend sends generic push notifications only.

## Observability

Optional observability stack:

- Prometheus
- Grafana
- Tempo
- Loki
- Alertmanager
- OTEL Collector
- postgres-exporter

Keep it off by default on small hosts unless diagnostics are needed.

## Product language

Production documentation and user-facing descriptions must use `server-trusted` or plain client-server messaging language.

Do not describe the product as E2EE.

## Message encryption provider

Production can run with either:

- `APP_MESSAGES_CONTENT_ENCRYPTION_PROVIDER=aws-kms` plus a real KMS key id and credentials
- `APP_MESSAGES_CONTENT_ENCRYPTION_PROVIDER=local` plus a stable `APP_MESSAGES_CONTENT_ENCRYPTION_LOCAL_MASTER_KEY_BASE64`

For a self-hosted single VPS without KMS, `local` is acceptable only when the master key is explicitly set and backed up outside the database host.
