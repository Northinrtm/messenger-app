# Messenger App

Production-oriented realtime messenger monolith with:

- `Spring Boot 3.5` backend
- `React 19 + TypeScript + Vite` web client
- `PostgreSQL 17` primary datastore
- `WebSocket/STOMP` realtime delivery
- optional `Redis` fan-out for multi-instance realtime
- embedded `Jitsi` stack for in-app conferences
- `Caddy` edge, production runbooks, local backups, and optional observability
- `Docker Compose` for local and production deployment

## Current Status

The repository currently supports:

- direct chats and group chats
- end-to-end encrypted text messaging
- message history, pagination, optimistic send, retry
- delivered/read receipts, typing indicators, reactions
- reply, edit, forward, pin/unpin, delete for self/everyone where allowed
- encrypted file attachments and image previews in chats
- Web Push notifications with plaintext-safe browser-side previews
- contacts, user search, blocking, archive, and per-chat drafts
- group ownership, moderators, bans, invite links, participant management
- scheduled and instant video conferences with Jitsi
- conference recordings import/download path
- registration, login, active sessions, profile editing, avatar update
- email verification and password reset by email
- trusted-device / passkey-based encrypted chat unlock
- server-side E2EE coverage diagnostics for support without plaintext access
- single-host horizontal scaling for `backend`/`web` through Docker Compose replicas
- production deploy, backup, healthcheck, websocket storm guard, and optional observability
- CI on `push`/`pull_request` and production auto-deploy from `main`

## Architecture

Main parts:

- `backend` - Spring Boot application
- `web` - React/Vite frontend
- `jitsi` - Jitsi config used by local and production compose
- `deploy` - production runbooks, Caddy, backups, server scripts
- `deploy/observability` - Prometheus, Grafana, Tempo, Loki, Alertmanager, OTEL Collector

Core backend areas:

- `application.auth`
- `application.chat`
- `application.message`
- `application.e2ee`
- `application.push`
- `security`
- `config`

## Core Features

### Auth and account

- username + password registration and login
- registration email-domain allowlist
- JWT access token + refresh token in `HttpOnly` cookie
- session restore after reload
- active session/device list
- revoke individual sessions
- profile edit and avatar update
- delete account from profile
- email verification flow with resend support
- password reset flow by email

### Chats and messaging

- user search, contacts, and blocks
- direct chats
- group chats
- per-chat drafts restored after reload
- unread counters
- archive for self
- delete chat for self
- realtime delivery through `WebSocket/STOMP`
- HTTP remains authoritative for message mutations and recovery sync
- reactions: `LIKE`, `DISLIKE`, `EYES`, `OK`
- replies, edits, forwards, pinned messages
- typing indicator with HTTP fallback
- encrypted file attachments with upload progress, cancel, retry-safe orphan cleanup, and image previews
- Web Push subscriptions for offline generic notifications
- browser-side notification previews when an open unlocked client already decrypted the message

### Attachments and media

- encrypted file attachments for direct and group messages
- image previews inside the message stream
- native-size image open flow from the chat
- default attachment size limit controlled by `APP_MEDIA_MESSAGE_ATTACHMENTS_MAX_SIZE_BYTES`
- orphan attachment cleanup for uploads that never get attached to a sent message
- Docker volume-backed local/prod storage for message attachments
- for multi-host deployments, attachments should be moved to S3-compatible object storage

### E2EE

- direct chats use `X3DH-DEVICE-AES-GCM`
- group chats use `GROUP-SENDER-KEY-AES-GCM`
- backend stores encrypted payloads, not plaintext
- encrypted chat unlock is separate from auth session
- trusted-device unlock supports `WebAuthn` / passkeys / Windows Hello / Touch ID where available
- browser-local encrypted state is restored across normal tab closes/reopens in the same browser profile
- decrypted message archive is used for recovery and fast history hydration
- group history-key fallback supports post-patch history access for later group participants where a grant exists
- production diagnostic script reports E2EE metadata coverage without decrypting or printing plaintext

### Groups

- owner-based group management
- add/remove participants
- assign/revoke moderators
- ban participants
- leave/delete group rules
- group invite links

### Video conferences

- instant conference
- scheduled conference
- join window opens 5 minutes before scheduled start
- in-app Jitsi embed
- participant invitations
- recording import/archive/download path

## What Is Not Implemented

- full-text search across message history
- media/file gallery per chat
- plaintext previews in server-sent push payloads
- separate distributed presence/last-seen service
- external event bus such as Kafka
- object storage for attachments and recordings for true multi-host scaling
- off-site backup replication
- automated end-to-end browser smoke tests
- hardened high-assurance metadata protection

## Development Roadmap

Recommended next work, in priority order:

1. Production confidence:
   add a smoke-test script that verifies health, login, direct chat, group chat, attachment upload, push config, and E2EE diagnostics after each deploy.
2. Search and media UX:
   add full-text message search, a per-chat media/file gallery, and quick navigation to the first unread message.
3. E2EE device management:
   expose encryption devices in the UI, support device revoke, and show actionable explanations for `Encrypted message unavailable`.
4. Push notification hardening:
   add stable VAPID key generation docs/script and later implement encrypted push payload previews that can be decrypted by the service worker.
5. Storage and backup hardening:
   move attachments/recordings to S3-compatible object storage and add off-site backup replication with restore rehearsal.
6. Scale path:
   move attachments/recordings to object storage, add distributed presence/last-seen, then introduce Kafka/NATS only if async delivery volume justifies it.

## Local Run With Docker

Requirements:

- Docker Desktop

Start the default local stack:

```bash
docker compose up --build
```

Local URLs:

- web: `http://localhost:3000`
- backend API: `http://localhost:8080`
- backend health: `http://localhost:8080/actuator/health`
- Mailpit UI: `http://localhost:8025`
- Jitsi web: `http://localhost:8090`

Useful profiles:

```bash
docker compose --profile redis up --build
```

```bash
docker compose --profile autonomous-recording up --build
```

Stop:

```bash
docker compose down
```

Reset local data:

```bash
docker compose down -v
```

### Local email behavior

The local Docker stack includes `Mailpit`.

- verification and password reset emails can be tested locally without a real SMTP provider
- backend defaults to `mailpit:1025` in local compose
- delivered test emails can be viewed in `http://localhost:8025`

## Local Backend + Frontend Without Full Docker

Requirements:

- Java `17+`
- Maven `3.9+`
- Node.js `22+`
- Docker Desktop for infrastructure services

Start infrastructure:

```bash
docker compose up -d postgres mailpit
```

Optional Redis:

```bash
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

Default local URLs:

- frontend dev server: `http://localhost:5173`
- backend: `http://localhost:8080`
- Mailpit: `http://localhost:8025`

## Environment

Base examples:

- [`.env.example`](.env.example)
- [`.env.prod.example`](.env.prod.example)

Important app variables:

- `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`
- `APP_CORS_ALLOWED_ORIGINS`
- `APP_JWT_SECRET`
- `APP_JWT_REFRESH_TOKEN_TTL`
- `APP_REALTIME_REDIS_ENABLED`
- `APP_AUTH_RATE_LIMIT_REDIS_ENABLED`
- `APP_REALTIME_REDIS_MAC_SECRET`
- `APP_AUTH_REGISTRATION_ALLOWED_EMAIL_DOMAINS`
- `APP_AUTH_EMAIL_VERIFICATION_ENABLED`
- `APP_AUTH_EMAIL_VERIFICATION_URL_BASE`
- `APP_AUTH_EMAIL_VERIFICATION_FROM_ADDRESS`
- `APP_AUTH_PASSWORD_RESET_ENABLED`
- `APP_AUTH_PASSWORD_RESET_URL_BASE`
- `APP_AUTH_PASSWORD_RESET_FROM_ADDRESS`
- `APP_MEDIA_MESSAGE_ATTACHMENTS_MAX_SIZE_BYTES`
- `APP_MEDIA_MESSAGE_ATTACHMENTS_ORPHAN_TTL`
- `APP_MEDIA_MESSAGE_ATTACHMENTS_ORPHAN_CLEANUP_FIXED_DELAY_MS`
- `APP_PUSH_ENABLED`
- `APP_PUSH_SUBJECT`
- `APP_PUSH_VAPID_PUBLIC_KEY`
- `APP_PUSH_VAPID_PRIVATE_KEY`
- `SPRING_MAIL_HOST`
- `SPRING_MAIL_PORT`
- `SPRING_MAIL_USERNAME`
- `SPRING_MAIL_PASSWORD`
- `SPRING_MAIL_SMTP_AUTH`
- `SPRING_MAIL_SMTP_SSL_ENABLE`
- `SPRING_MAIL_SMTP_STARTTLS_ENABLE`
- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_JITSI_BASE_URL`

Registration is restricted by `APP_AUTH_REGISTRATION_ALLOWED_EMAIL_DOMAINS`.
The default examples already include common public providers such as Gmail, Outlook, Yahoo, iCloud, Yandex, Mail.ru, Rambler, Proton, GMX, Fastmail, and Zoho.

## Push Notifications

Web Push is opt-in per browser profile from the profile settings panel.

Security model:

- backend stores only browser push subscription metadata
- server-sent push notifications are generic and do not include message plaintext
- if the app is already open, unlocked, and receives a decrypted realtime message while hidden, the browser notification can show sender and preview locally
- if the browser/app is closed, the notification only says that a new message arrived

Production should use stable VAPID keys through `APP_PUSH_VAPID_PUBLIC_KEY` and `APP_PUSH_VAPID_PRIVATE_KEY`.
If they are empty, the backend generates temporary keys on startup; this is acceptable for local dev, but existing push subscriptions need refresh after restart.

## Email Verification and Password Reset

Production requires one real outgoing mailbox.

Important:

- the app sends from one configured mailbox
- users can register with any recipient mailbox such as `gmail.com`, `outlook.com`, `icloud.com`, `mail.ru`, and others
- production SMTP credentials must stay only in server-side `.env.prod`
- do not commit `.env.prod` or real SMTP secrets to git

Typical production variables:

```bash
APP_AUTH_EMAIL_VERIFICATION_ENABLED=true
APP_AUTH_EMAIL_VERIFICATION_URL_BASE=https://your-domain.example/
APP_AUTH_EMAIL_VERIFICATION_FROM_ADDRESS=no-reply@your-domain.example
APP_AUTH_PASSWORD_RESET_ENABLED=true
APP_AUTH_PASSWORD_RESET_URL_BASE=https://your-domain.example/
APP_AUTH_PASSWORD_RESET_FROM_ADDRESS=no-reply@your-domain.example
SPRING_MAIL_HOST=smtp.example.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=no-reply@your-domain.example
SPRING_MAIL_PASSWORD=CHANGE_ME
SPRING_MAIL_SMTP_AUTH=true
SPRING_MAIL_SMTP_SSL_ENABLE=false
SPRING_MAIL_SMTP_STARTTLS_ENABLE=true
```

## Production

Production compose uses:

- `postgres`
- `redis`
- `backend`
- `web`
- `edge` via `Caddy`
- core `Jitsi` containers
- optional observability profile

### Horizontal scaling

Production is prepared for single-host Docker Compose scaling of stateless runtime services.

Set these values in server-side `.env.prod`:

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-random-secret>
APP_JWT_SECRET=<stable-base64-secret>
BACKEND_REPLICAS=2
WEB_REPLICAS=2
```

Then deploy normally:

```bash
cd /opt/messenger-app
./deploy/remote-update.sh
```

`remote-update.sh` applies `--scale backend=<BACKEND_REPLICAS>` and `--scale web=<WEB_REPLICAS>`.
Realtime events and session revocations are fanned out through Redis, auth endpoint rate limits can be Redis-backed, and scheduled backend jobs use Postgres advisory locks so only one replica runs each cluster job at a time.

Current scale boundary:

- `postgres`, `redis`, `edge`, and the bundled `jitsi` services remain single-instance in this compose topology.
- Attachments and conference recordings still use Docker volumes; for several hosts, move them to S3/MinIO-compatible object storage first.
- On small `2 GB RAM` hosts, keep replicas at `1` unless memory headroom is measured.

Main files:

- [`docker-compose.prod.yml`](docker-compose.prod.yml)
- [`deploy/PRODUCTION.md`](deploy/PRODUCTION.md)
- [`deploy/BACKUPS.md`](deploy/BACKUPS.md)
- [`docs/horizontal-scaling-readiness.md`](docs/horizontal-scaling-readiness.md)

Recommended production rules:

- keep `.env.prod` only on the server
- use a dedicated `deploy` user with SSH key auth
- keep `ENABLE_OBSERVABILITY_STACK=false` on small `2 GB RAM` hosts
- keep `MANAGEMENT_TRACING_ENABLED=false` on small hosts unless observability is intentionally enabled

## Health and Observability

Built-in health and telemetry:

- backend health: `/actuator/health`
- Prometheus metrics: `/actuator/prometheus`
- structured JSON logs in production
- optional observability stack: Prometheus, Grafana, Tempo, Loki, Alertmanager, OTEL Collector, `postgres-exporter`
- scheduled production healthcheck workflow
- scheduled websocket storm guard workflow for `/ws` and `429` spikes

For small hosts, observability is intended to stay off by default and be enabled only when needed for diagnostics.

### E2EE diagnostics

When a user reports `Encrypted message unavailable`, use:

```bash
cd /opt/messenger-app
deploy/e2ee-coverage-diagnostic.sh --chat-id <chat-uuid>
deploy/e2ee-coverage-diagnostic.sh --chat-id <chat-uuid> --message-id <message-uuid>
```

The script prints only metadata: active participant devices, message envelope coverage, history-key grants, and missing device coverage.
It does not read, decrypt, or print plaintext.

## CI/CD

GitHub Actions currently provides:

- backend tests on every `push` and `pull_request`
- frontend typecheck, tests, and build on every `push` and `pull_request`
- automatic production deploy from `main`
- scheduled public production healthcheck
- scheduled websocket storm guard over SSH

Workflows:

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- [`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml)
- [`.github/workflows/prod-healthcheck.yml`](.github/workflows/prod-healthcheck.yml)
- [`.github/workflows/prod-websocket-guard.yml`](.github/workflows/prod-websocket-guard.yml)

For the current default server setup, only `PROD_SSH_KEY` is strictly required in the GitHub `production` environment.
`PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_PORT`, `PROD_APP_DIR`, and `PROD_PUBLIC_BASE_URL` already have workflow defaults and can be overridden only when needed.

## Backups

Repository backup helpers cover:

- PostgreSQL dump
- PostgreSQL globals
- `.env.prod`, `docker-compose.prod.yml`, `deploy/Caddyfile`
- `caddy_data`
- conference recording volumes
- encrypted chat attachment volume

See:

- [`deploy/BACKUPS.md`](deploy/BACKUPS.md)
- [`deploy/install-backup-timer.sh`](deploy/install-backup-timer.sh)
- [`deploy/backup.sh`](deploy/backup.sh)

## Verification Commands

Frontend:

```bash
cd web
npm install
npm run typecheck
npm run test:run
npm run build
```

Backend:

```bash
cd backend
mvn test
```

## Practical Manual Checks

1. Register two users with real or test email addresses.
2. Verify email confirmation and password reset flow.
3. Create a direct chat and send the first message.
4. Create a group chat and add participants.
5. Verify typing, receipts, reactions, reply, edit, forward, pin, and delete flows.
6. Upload an image and a non-image file in direct and group chats.
7. Reopen the browser and verify encrypted chats restore correctly for the same browser profile.
8. Log in from another browser profile and verify trusted-device unlock and group history behavior.
9. Enable push notifications and verify generic closed-app push plus hidden-tab browser-side preview.
10. Start or schedule a conference and verify joinability near the scheduled time.
11. Run `deploy/e2ee-coverage-diagnostic.sh` for a known group chat without exposing plaintext.
