# Production Runbook

## Goal

Keep production deploys short and avoid long-lived interactive `root` SSH sessions.

## Recommended server-side setup

1. Create a dedicated `deploy` user.
2. Add an SSH public key for that user.
3. Give that user access to `docker` and only the minimum required `sudo` commands if needed.
4. Keep `.env.prod` only on the server.
5. Use `/opt/messenger-app` as the checkout directory.
6. Enable `fail2ban` and firewall rules for SSH.
7. Disable password-based SSH after confirming key-based access works.

Repository helpers:

- `deploy/server-bootstrap.sh`
- `deploy/preflight-prod.sh`
- `deploy/disable-ssh-passwords.sh`
- `deploy/backup.sh`
- `deploy/install-backup-timer.sh`
- `deploy/BACKUPS.md`
- `deploy/sshd_config.d/10-messenger-hardening.conf`
- `deploy/sshd_config.d/20-disable-password-auth.conf`
- `deploy/fail2ban/jail.d/messenger-sshd.local`

## One-time GitHub Secrets

Store these in GitHub `production` environment secrets:

- `PROD_SSH_KEY` required
- `PROD_SSH_KNOWN_HOSTS` optional; if omitted, the workflow will fetch the host key with `ssh-keyscan`

Store these in GitHub `production` environment variables:

- `PROD_SSH_HOST` optional; defaults to `83.147.244.194`
- `PROD_SSH_USER` optional; defaults to `deploy`
- `PROD_SSH_PORT` optional; defaults to `22`
- `PROD_APP_DIR` optional; defaults to `/opt/messenger-app`
- `PROD_PUBLIC_BASE_URL` optional; defaults to `https://pishi.ktsf.ru`

Do not store `.env.prod` in GitHub. Keep app secrets on the server.

## Deploy flow

Production now deploys automatically as the final job of the `CI` workflow on every `push` to `main`.
The standalone `Deploy Production` workflow remains available only for manual reruns through `workflow_dispatch`.

The deploy job uploads `deploy/remote-update.sh` and runs it on the server.

`remote-update.sh` will:

1. verify the server checkout is clean
2. fast-forward `main`
3. run a production preflight against `.env.prod`
4. validate the production compose config against `.env.prod`
5. rebuild `web`, `backend`, and `edge`
6. ensure the required support services are running and ready: `postgres`, `redis`, `jitsi-prosody`, `jitsi-jicofo`, `jitsi-jvb`, `jitsi-web`, and `vault` when `APP_E2EE_ESCROW_PROVIDER=vault-transit`
7. recreate the deploy-time application runtime: `web`, `backend`, and `edge`
8. stop and remove observability containers unless `ENABLE_OBSERVABILITY_STACK=true`
9. print `docker compose ps`

By default this keeps persistent production data in Docker volumes.
If you need a truly fresh rollout, run the manual `Deploy Production` workflow with `full_reset=true`.
That mode performs:

1. a clean server checkout reset
2. `docker compose down --volumes --remove-orphans`
3. a full rebuild and bootstrap from the current repository state

`full_reset=true` is destructive for server-side state stored in named volumes:

- PostgreSQL data
- Redis data
- Vault file storage if the `vault` profile is used
- message attachments / recordings / bundled Jitsi state

This default deploy path is intentional for small hosts such as `2 vCPU / 2 GB RAM`.
It keeps the core app running and avoids spending scarce memory on Grafana/Prometheus/Tempo/Loki by default.

If you want truly hands-off deploys, make sure the GitHub `production` environment does not require manual approval.
With this setup, `push` to `main` creates one workflow run instead of separate parallel `CI` and `Deploy Production` runs.

## Observability

Optional production observability can run on the same server with these internal services:

- `prometheus`
- `grafana`
- `tempo`
- `otel-collector`
- `alertmanager`
- `loki`
- `promtail`
- `postgres-exporter`

When the observability stack is enabled, only Grafana is exposed externally, through:

- `https://<APP_DOMAIN>/observability/`

Required `.env.prod` values:

- `GRAFANA_ADMIN_USER`
- `GRAFANA_ADMIN_PASSWORD`
- `APP_ACTUATOR_SCRAPE_USERNAME`
- `APP_ACTUATOR_SCRAPE_PASSWORD`
- `ENABLE_OBSERVABILITY_STACK=true`
- `MANAGEMENT_TRACING_ENABLED=true`
- `MANAGEMENT_TRACING_SAMPLING_PROBABILITY`
- `MANAGEMENT_OTLP_TRACING_ENDPOINT`
- `ALERTMANAGER_WEBHOOK_URL` if you want external alert delivery

You can run the same deploy preflight manually before the first production rollout:

```bash
cd /opt/messenger-app
bash deploy/preflight-prod.sh .env.prod
```

Production compose fails closed if the Prometheus scrape credentials are missing.
Set explicit values in `.env.prod` before enabling the observability stack.
When `ENABLE_OBSERVABILITY_STACK=false`, `/observability/` intentionally returns `404`.

Production backend logs run in JSON mode and are shipped into Loki by Promtail.
Production Docker logs use bounded `json-file` rotation controlled by `DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILE`.
Alertmanager is part of the stack and can forward alerts through `ALERTMANAGER_WEBHOOK_URL`.

Recommended memory policy on a `2 GB RAM` VPS:

- set `ENABLE_OBSERVABILITY_STACK=false`
- set `MANAGEMENT_TRACING_ENABLED=false`
- keep the always-on core stack within the compose limits budget:
  `vault 128m + postgres 192m + redis 64m + jitsi-prosody 64m + jitsi-jicofo 96m + jitsi-jvb 192m + jitsi-web 64m + backend 640m + web 96m + edge 64m ~= 1.6 GB`
- enable at least `2G` of swap on the host for burst protection:
  `sudo bash deploy/enable-swap.sh 2G`
- use observability only temporarily during diagnostics
- plan a bigger host before keeping Grafana, Prometheus, Tempo, Loki, and Jitsi active together
- use the `Production WebSocket Guard` GitHub Actions workflow as the lightweight default alert path for websocket storms on small hosts
- that workflow reads recent `ws_access` logs from the `web` compose service over SSH and fails if `/ws` or `429` volume crosses the configured thresholds
- without `ALERTMANAGER_WEBHOOK_URL`, alerts stay inside GitHub Actions and GitHub notifications rather than being pushed to Telegram, Slack, or another external destination

## Horizontal Scaling

Single-host Docker Compose scaling is supported for `backend` and `web`.
Keep all secrets stable across replicas.

Set in `.env.prod`:

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-random-secret>
APP_JWT_SECRET=<stable-base64-secret>
BACKEND_REPLICAS=2
WEB_REPLICAS=2
```

Choose one escrow backend and keep it identical on every backend replica:

```bash
# Option A: local escrow secret
APP_E2EE_ESCROW_PROVIDER=local
APP_E2EE_ESCROW_SECRET=<stable-base64-secret>
```

```bash
# Option B: Vault Transit (recommended for VPS / production)
APP_E2EE_ESCROW_PROVIDER=vault-transit
APP_E2EE_ESCROW_VAULT_ADDRESS=http://vault:8200
APP_E2EE_ESCROW_VAULT_TOKEN=<vault-token>
APP_E2EE_ESCROW_VAULT_MOUNT_PATH=transit
APP_E2EE_ESCROW_VAULT_KEY_NAME=messenger-history-escrow
```

Run the normal deploy:

```bash
cd /opt/messenger-app
./deploy/remote-update.sh
```

The deploy script reads `BACKEND_REPLICAS` and `WEB_REPLICAS` from `.env.prod` unless they are already exported in the shell.
It then runs Compose with `--scale backend=<value>` and `--scale web=<value>`.

What this covers:

- websocket/realtime fan-out between backend replicas through signed Redis events
- websocket session revocation fan-out between backend replicas
- Redis-backed auth endpoint rate limiting
- stateless HTTP routing through `web` and Docker DNS
- one active runner per scheduled backend job through Postgres advisory locks
- one active runner per E2EE maintenance batch: epoch rotation, history backfill, regrant, and identity-reset follow-up
- Prometheus backend scraping through Docker DNS discovery

What is still singleton or host-local:

- `postgres`, `redis`, `edge`, and bundled Jitsi services
- Docker volumes for message attachments and conference recordings
- local backups on one server

Before moving to multiple physical hosts, move attachments/recordings to S3/MinIO-compatible object storage and add off-site backup replication.

## Push Notifications

Set stable VAPID keys in `.env.prod` before relying on Web Push in production:

```bash
APP_PUSH_ENABLED=true
APP_PUSH_SUBJECT=mailto:no-reply@your-domain.example
APP_PUSH_VAPID_PUBLIC_KEY=<base64url-uncompressed-p256-public-key>
APP_PUSH_VAPID_PRIVATE_KEY=<base64url-p256-private-key>
```

If VAPID keys are empty, the backend generates temporary keys on startup. That keeps local/dev usable, but production subscriptions become stale after every backend restart.

The backend sends generic push notifications only. Message plaintext stays out of server-sent push payloads; notification previews are shown only by an already-open unlocked web client after local decryption.

## Managed E2EE Operating Rules

Production should treat the chat encryption model as managed E2EE:

- the first identity signing key is bootstrapped during authenticated onboarding
- account encryption public keys are published as signed bundles and rotated under the same identity signing key
- identity reset is a separate security event that requires fresh user authentication
- the server stores escrowed history-key material so it can regrant history access and recover active epochs according to chat policy

This means production must not describe the system as strict zero-knowledge E2EE.
The backend still stores ciphertext instead of plaintext, but it can recover history keys under the product's managed recovery rules.

Operationally important consequences:

- ordinary account-key rotation should be transparent to users
- identity reset should be treated like a security-sensitive account recovery flow
- loss of PostgreSQL data plus the active escrow backend breaks managed history recovery even if message ciphertext still exists
- active chat history keys should rotate on membership/security events and also periodically by age; the default deploy policy now rotates stale active keys after `P30D`

## Vault Transit On A VPS

For a single VPS, `vault-transit` is the preferred production escrow backend.
It keeps the escrow master key inside Vault Transit instead of inside the backend process environment.

Minimum production flow:

1. Set in `.env.prod`:

```bash
APP_E2EE_ESCROW_PROVIDER=vault-transit
APP_E2EE_ESCROW_VAULT_ADDRESS=http://vault:8200
APP_E2EE_ESCROW_VAULT_TOKEN=<vault-token>
APP_E2EE_ESCROW_VAULT_MOUNT_PATH=transit
APP_E2EE_ESCROW_VAULT_KEY_NAME=messenger-history-escrow
```

2. Bring up Vault once:

```bash
cd /opt/messenger-app
docker compose -f docker-compose.prod.yml --profile vault up -d vault
```

3. Initialize and unseal Vault using the standard Vault operator flow.
4. Bootstrap the Transit mount and key:

```bash
cd /opt/messenger-app
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=<vault-token>
bash deploy/vault/bootstrap-transit.sh
```

5. Deploy the rest of the stack normally with `./deploy/remote-update.sh`.

Notes:

- keep Vault init/unseal material outside the application repo and outside PostgreSQL backups
- `docker-compose.prod.yml` exposes Vault only on `127.0.0.1:8200`; keep it that way on a single VPS unless you have a separate secure access path
- if you stay on `APP_E2EE_ESCROW_PROVIDER=local`, treat `APP_E2EE_ESCROW_SECRET` like a production root secret and rotate it only with a planned migration

## E2EE Coverage Diagnostics

Use the server-side diagnostic script when a user reports `Encrypted message unavailable`.
It prints only encryption metadata: participant account-key readiness, message shared-envelope coverage, history-key grants, and unreadable-message coverage.
It does not read, decrypt, or print message plaintext.

```bash
cd /opt/messenger-app
deploy/e2ee-coverage-diagnostic.sh --chat-id <chat-uuid>
deploy/e2ee-coverage-diagnostic.sh --chat-id <chat-uuid> --message-id <message-uuid>
```

Important fields:

- `has_shared_envelope` means the message still carries the authenticated encrypted payload expected by the current chat-epoch scheme.
- `has_history_access` means the participant account has a wrapped copy of the chat history key.
- `has_history_key` means the stored message points at a server-known history key epoch.
- `can_read` is true when the sender is looking at their own message or the participant has a usable history fallback.
- `joined_after_message` helps distinguish expected late-joiner gaps from current grant bugs.

## Backups

The repository includes a local production backup path:

- `deploy/backup.sh`
- `deploy/install-backup-timer.sh`
- `deploy/backup.env.example`
- `deploy/BACKUPS.md`

Default coverage:

- PostgreSQL dump
- PostgreSQL globals
- `.env.prod`, `docker-compose.prod.yml`, `deploy/Caddyfile`
- `caddy_data`
- `conference_recordings_archive`
- `conference_recordings_raw`
- `message_attachments`
- `vault_data` when the optional Vault profile is used with file storage

Default schedule:

- daily systemd timer at `03:35` with a small randomized delay

Default retention:

- `14` days

This is intentionally a local-on-server backup setup.
It is much better than having no backups, but it is not a substitute for off-site replication.

For managed E2EE, the backup plan is only valid if the active escrow backend is preserved and restore-tested together with PostgreSQL:

- for `APP_E2EE_ESCROW_PROVIDER=local`, preserve `APP_E2EE_ESCROW_SECRET`
- for `APP_E2EE_ESCROW_PROVIDER=vault-transit`, preserve Vault storage such as `vault_data` plus the Vault init/unseal material

## Emergency manual deploy

```bash
cd /opt/messenger-app
./deploy/remote-update.sh
```

## Emergency server recovery

If SSH starts rejecting sessions with `Exceeded MaxStartups`, use the provider console to:

```bash
systemctl restart ssh || systemctl restart sshd
```

If that is not enough, reboot the server from the provider panel.

## Minimal first-access sequence

1. Log in as `root` from the provider console.
2. Clone the repo to `/opt/messenger-app`.
3. Run `DEPLOY_PUBLIC_KEY='ssh-ed25519 ...' bash deploy/server-bootstrap.sh`.
4. Verify key-based login as `deploy`.
5. Run `bash deploy/disable-ssh-passwords.sh`.
6. Configure GitHub `production` environment with required value `PROD_SSH_KEY`; add `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KNOWN_HOSTS`, `PROD_SSH_PORT`, `PROD_APP_DIR`, and `PROD_PUBLIC_BASE_URL` only if you need to override the workflow defaults.
7. Install backups with `bash deploy/install-backup-timer.sh`.
8. Use the `Deploy Production` workflow for future deploys.
