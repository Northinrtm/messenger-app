# Backups

## What is backed up

The backup helpers store local timestamped snapshots with:

- PostgreSQL custom-format dump
- PostgreSQL globals dump
- `.env.prod`, `docker-compose.prod.yml`, and `deploy/Caddyfile`
- Docker volume archives for:
  - `caddy_data`
  - `conference_recordings_archive`
  - `conference_recordings_raw`
  - `minio_data`

Default backup root:

- `/opt/messenger-backups`

Default retention:

- `14` days

This is local-on-server backup, not off-site disaster recovery.

## Install

Run as `root`:

```bash
cd /opt/messenger-app
bash deploy/install-backup-timer.sh
```

## Manual run

```bash
cd /opt/messenger-app
bash deploy/backup.sh
```

Or:

```bash
systemctl start messenger-backup.service
```

## Restore notes

High-level restore flow:

1. Clone the repo to `/opt/messenger-app`.
2. Restore `.env.prod` and config archive.
3. Start `postgres`.
4. Restore globals.
5. Restore the main database.
6. Restore `caddy_data`, conference recordings, and `minio_data` if needed.
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

## Operational rule

Backups must be restore-tested together with the running production schema and `.env.prod`.
