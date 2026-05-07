# Messenger App

Production-oriented messenger monolith with:

- Spring Boot backend
- React + TypeScript + Vite web client
- PostgreSQL primary datastore
- WebSocket/STOMP realtime delivery
- optional Redis fan-out for multi-instance backend delivery
- bundled Jitsi stack for conferences
- Docker Compose for local and production deployment

## Messaging model

The project now uses a `server-trusted` messaging model.

- Clients send `PlainMessagePayload`.
- The server validates, stores, and broadcasts readable message content.
- Legacy client-side message crypto and unlock flows are removed.
- Security remains based on TLS, authentication, authorization, backups, and server-side operational controls.

This project must not be described as E2EE.

## Current features

- registration, login, refresh, active sessions, password change, password reset, email verification
- direct chats and group chats
- `JOIN_ONLY` and `FULL_HISTORY` prejoin-history policy for groups
- send, edit, reply, forward, pin, reactions, delete-for-self, delete-for-everyone where allowed
- unread counters, typing indicators, delivered/read receipts
- file attachments and image previews
- contacts, user search, archive, drafts, blocking
- group owners, moderators, bans, invite links
- conferences with Jitsi and recording import/download flow
- generic Web Push notifications without server-side message previews
- optional observability stack for production

## Repository layout

- `backend` - Spring Boot application
- `web` - React/Vite frontend
- `deploy` - production scripts, backups, runbooks, Caddy, observability
- `jitsi` - local and production Jitsi configuration
- `docs` - architecture and product notes

## Local run

Requirements:

- Docker Desktop

Start the default stack:

```bash
docker compose up --build
```

Useful profiles:

```bash
docker compose --profile redis up --build
docker compose --profile autonomous-recording up --build
```

Local URLs:

- web: `http://localhost:3000`
- backend: `http://localhost:8080`
- backend health: `http://localhost:8080/actuator/health`
- Mailpit: `http://localhost:8025`
- Jitsi: `http://localhost:8090`

Stop:

```bash
docker compose down
```

Reset local data:

```bash
docker compose down -v
```

## Backend + frontend without full Docker

Requirements:

- Java 17+
- Maven 3.9+
- Node.js 22+

Start infrastructure:

```bash
docker compose up -d postgres mailpit
docker compose --profile redis up -d redis
```

Run backend:

```bash
cd backend
mvn spring-boot:run
```

Run frontend:

```bash
cd web
npm install
npm run dev
```

## Environment

Base examples:

- [`.env.example`](.env.example)
- [`.env.prod.example`](.env.prod.example)
- [`.env.deploy-button.example`](.env.deploy-button.example)

Important variables:

- `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`
- `APP_CORS_ALLOWED_ORIGINS`
- `APP_JWT_SECRET`
- `APP_REALTIME_REDIS_ENABLED`
- `APP_AUTH_RATE_LIMIT_REDIS_ENABLED`
- `APP_REALTIME_REDIS_MAC_SECRET`
- `APP_AUTH_REGISTRATION_ALLOWED_EMAIL_DOMAINS`
- `APP_AUTH_EMAIL_VERIFICATION_*`
- `APP_AUTH_PASSWORD_RESET_*`
- `APP_MEDIA_MESSAGE_ATTACHMENTS_*`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `APP_PUSH_*`
- `SPRING_MAIL_*`
- `BACKEND_REPLICAS`
- `WEB_REPLICAS`

## Production

Main files:

- [`docker-compose.prod.yml`](docker-compose.prod.yml)
- [`deploy/PRODUCTION.md`](deploy/PRODUCTION.md)
- [`deploy/BACKUPS.md`](deploy/BACKUPS.md)
- [`docs/horizontal-scaling-readiness.md`](docs/horizontal-scaling-readiness.md)
- [`.github/workflows/deploy-production.yml`](.github/workflows/deploy-production.yml)

Manual deploy from GitHub Actions:

1. Create a GitHub `production` environment or repository secrets.
2. Add:
   - `PROD_SSH_HOST`
   - `PROD_SSH_PORT`
   - `PROD_SSH_USER`
   - `PROD_APP_DIR`
   - `PROD_PUBLIC_BASE_URL`
   - `PROD_SSH_PRIVATE_KEY`
   - `PROD_SSH_KNOWN_HOSTS`
3. Open `Actions -> Deploy Production -> Run workflow`.

Manual deploy from your workstation:

```powershell
Copy-Item .env.deploy-button.example .env.deploy-button
# edit .env.deploy-button with PROD_SSH_HOST / PROD_PUBLIC_BASE_URL
deploy\deploy-prod-button.cmd
```

Server-side deploy script:

```bash
cd /opt/messenger-app
./deploy/remote-update.sh
```

## Horizontal scaling

Single-host Docker Compose scaling is supported for `backend` and `web`.

Recommended baseline:

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-secret>
APP_JWT_SECRET=<stable-secret>
BACKEND_REPLICAS=2
WEB_REPLICAS=2
```

MinIO direct transfer note:

- `APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_PUBLIC_ENDPOINT` must point to the public `/storage` path served by the edge proxy, for example `https://your-domain.example/storage`

Current boundary:

- `postgres`, `redis`, `edge`, and bundled Jitsi services remain singleton in this topology
- conference recordings still use Docker volumes, so multi-host rollout still requires object storage for recordings

## Backups

The repository includes local-on-server backup helpers for:

- PostgreSQL dump
- PostgreSQL globals
- `.env.prod`, `docker-compose.prod.yml`, `deploy/Caddyfile`
- `caddy_data`
- `conference_recordings_archive`
- `conference_recordings_raw`
- `minio_data`

See:

- [`deploy/BACKUPS.md`](deploy/BACKUPS.md)
- [`deploy/backup.sh`](deploy/backup.sh)
- [`deploy/install-backup-timer.sh`](deploy/install-backup-timer.sh)

## Verification

Backend:

```bash
cd backend
mvn test
```

Frontend:

```bash
cd web
npm install
npm run typecheck
npm run test:run
npm run build
```
