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

- [server-bootstrap.sh](/d:/programs/coding/VSprojects/messenger-app/deploy/server-bootstrap.sh)
- [disable-ssh-passwords.sh](/d:/programs/coding/VSprojects/messenger-app/deploy/disable-ssh-passwords.sh)
- [10-messenger-hardening.conf](/d:/programs/coding/VSprojects/messenger-app/deploy/sshd_config.d/10-messenger-hardening.conf)
- [20-disable-password-auth.conf](/d:/programs/coding/VSprojects/messenger-app/deploy/sshd_config.d/20-disable-password-auth.conf)
- [messenger-sshd.local](/d:/programs/coding/VSprojects/messenger-app/deploy/fail2ban/jail.d/messenger-sshd.local)

## One-time GitHub Secrets

Store these in GitHub `production` environment secrets:

- `PROD_SSH_KEY`

Do not store `.env.prod` in GitHub. Keep app secrets on the server.

The current deploy workflow already has the production host, port, user, and app directory baked in:

- host: `83.147.244.194`
- port: `22`
- user: `deploy`
- app dir: `/opt/messenger-app`

So the only secret you need in GitHub is the private key for that `deploy` user.

## Deploy flow

Use the manual `Deploy Production` GitHub Actions workflow.

The workflow uploads `deploy/remote-update.sh` and runs it on the server.

`remote-update.sh` will:

1. verify the server checkout is clean
2. fast-forward `main`
3. rebuild `web`, `backend`, and `edge`
4. recreate the default lightweight runtime stack: `web`, `backend`, `edge`, and `redis`
5. stop and remove observability containers unless `ENABLE_OBSERVABILITY_STACK=true`
6. print `docker compose ps`

This default deploy path is intentional for small hosts such as `2 vCPU / 2 GB RAM`.
It keeps the core app running and avoids spending scarce memory on Grafana/Prometheus/Tempo/Loki by default.

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

If the Prometheus scrape credentials are omitted, production compose falls back to `prometheus/prometheus`.
That is acceptable only as a bootstrap/default; set explicit values in `.env.prod` for a real deployment.

Production backend logs run in JSON mode and are shipped into Loki by Promtail.
Alertmanager is part of the stack and can forward alerts through `ALERTMANAGER_WEBHOOK_URL`.

Recommended memory policy on a `2 GB RAM` VPS:

- keep `ENABLE_OBSERVABILITY_STACK=false`
- keep `MANAGEMENT_TRACING_ENABLED=false`
- use observability only temporarily during diagnostics
- plan a bigger host before keeping Grafana, Prometheus, Tempo, Loki, and Jitsi active together

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
6. Configure GitHub `production` environment secret `PROD_SSH_KEY`.
7. Use the `Deploy Production` workflow for future deploys.
