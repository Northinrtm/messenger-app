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
3. validate the production compose config against `.env.prod`
4. rebuild `web`, `backend`, and `edge`
5. ensure the required support services are running: `postgres`, `redis`, `jitsi-prosody`, `jitsi-jicofo`, `jitsi-jvb`, and `jitsi-web`
6. recreate the deploy-time application runtime: `web`, `backend`, and `edge`
7. stop and remove observability containers unless `ENABLE_OBSERVABILITY_STACK=true`
8. print `docker compose ps`

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

Only Grafana is exposed externally, through:

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

Production compose fails closed if the Prometheus scrape credentials are missing.
Set explicit values in `.env.prod` before enabling the observability stack.

Production backend logs run in JSON mode and are shipped into Loki by Promtail.
Production Docker logs use bounded `json-file` rotation controlled by `DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILE`.
Alertmanager is part of the stack and can forward alerts through `ALERTMANAGER_WEBHOOK_URL`.

Recommended memory policy on a `2 GB RAM` VPS:

- keep `ENABLE_OBSERVABILITY_STACK=false`
- keep `MANAGEMENT_TRACING_ENABLED=false`
- use observability only temporarily during diagnostics
- plan a bigger host before keeping Grafana, Prometheus, Tempo, Loki, and Jitsi active together
- use the `Production WebSocket Guard` GitHub Actions workflow as the lightweight default alert path for websocket storms on small hosts
- that workflow reads recent `ws_access` logs from `messenger-web` over SSH and fails if `/ws` or `429` volume crosses the configured thresholds
- without `ALERTMANAGER_WEBHOOK_URL`, alerts stay inside GitHub Actions and GitHub notifications rather than being pushed to Telegram, Slack, or another external destination

## E2EE Coverage Diagnostics

Use the server-side diagnostic script when a user reports `Encrypted message unavailable`.
It prints only encryption metadata: active participant devices, message envelope coverage, history-key grants, and missing device coverage.
It does not read, decrypt, or print message plaintext.

```bash
cd /opt/messenger-app
deploy/e2ee-coverage-diagnostic.sh --chat-id <chat-uuid>
deploy/e2ee-coverage-diagnostic.sh --chat-id <chat-uuid> --message-id <message-uuid>
```

Important fields:

- `has_history_envelope` means the message can use the post-patch group history fallback.
- `has_history_access` means the recipient device has a wrapped copy of the group history key.
- `can_receive` is true when the device has either a live sender-key envelope or a usable history fallback.
- `joined_after_message` helps distinguish expected pre-patch/late-joiner gaps from current grant bugs.

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

Default schedule:

- daily systemd timer at `03:35` with a small randomized delay

Default retention:

- `14` days

This is intentionally a local-on-server backup setup.
It is much better than having no backups, but it is not a substitute for off-site replication.

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
