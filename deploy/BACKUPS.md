# Backups

## What is backed up

The production backup script stores local timestamped snapshots with:

- PostgreSQL custom-format dump: `postgres.dump`
- PostgreSQL globals dump: `postgres-globals.sql.gz`
- production config archive: `.env.prod`, `docker-compose.prod.yml`, `deploy/Caddyfile`
- Docker volume archives for:
  - `caddy_data`
  - `conference_recordings_archive`
  - `conference_recordings_raw`
  - `message_attachments`
- metadata files with timestamp, current git revision, and `docker compose ps`

Default backup root:

- `/opt/messenger-backups`

Default retention:

- `14` days

This is a local-on-server backup strategy.
It protects against operator mistakes and short-lived incidents, but it is not off-site disaster recovery.

## Install

Run as `root` on the server:

```bash
cd /opt/messenger-app
bash deploy/install-backup-timer.sh
```

This installs:

- `messenger-backup.service`
- `messenger-backup.timer`
- `/etc/messenger-backup.env` if it does not exist yet

## Manual run

```bash
cd /opt/messenger-app
bash deploy/backup.sh
```

Or through systemd:

```bash
systemctl start messenger-backup.service
```

## Restore Notes

High-level restore flow on a fresh server:

1. Clone the repo to `/opt/messenger-app`.
2. Restore `.env.prod` from `config.tar.gz`.
3. Start only `postgres`.
4. Restore globals from `postgres-globals.sql.gz`.
5. Restore the main database from `postgres.dump`.
6. Restore `caddy_data`, conference recording, and `message_attachments` volume archives if needed.
7. Start the rest of the stack.

Example database restore:

```bash
gunzip -c postgres-globals.sql.gz | docker exec -i messenger-postgres psql -U messenger postgres
docker exec -i messenger-postgres pg_restore --clean --if-exists -U messenger -d messenger < postgres.dump
```

Example volume restore:

```bash
docker run --rm -i \
  -v messenger-app_caddy_data:/restore \
  --entrypoint sh \
  caddy:2.9-alpine \
  -lc 'rm -rf /restore/* /restore/.[!.]* /restore/..?* 2>/dev/null || true; tar -C /restore -xzf -' \
  < volume-caddy_data.tar.gz
```
