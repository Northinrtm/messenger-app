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

## One-time GitHub Secrets

Store these in GitHub `production` environment secrets:

- `PROD_SSH_HOST`
- `PROD_SSH_PORT`
- `PROD_SSH_USER`
- `PROD_SSH_KEY`
- `PROD_APP_DIR`

Do not store `.env.prod` in GitHub. Keep app secrets on the server.

## Deploy flow

Use the manual `Deploy Production` GitHub Actions workflow.

The workflow uploads `deploy/remote-update.sh` and runs it on the server.

`remote-update.sh` will:

1. verify the server checkout is clean
2. fast-forward `main`
3. rebuild `web`, `backend`, and `edge`
4. recreate those services
5. print `docker compose ps`

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
