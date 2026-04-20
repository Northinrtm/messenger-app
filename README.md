# Messenger App

Messenger App is a realtime messenger monolith with:

- `Spring Boot` backend
- `React + TypeScript` web client
- `PostgreSQL` as the primary datastore
- `Docker Compose` for local/dev deployment
- embedded `Jitsi` stack for scheduled video conferences

The current repository state is focused on direct chats, group chats, E2EE text messages, session management, and scheduled conferences.

## What Works Now

### Auth and sessions

- register and sign in with `username + password`
- password policy enforcement on the backend
- JWT access token
- refresh token in `HttpOnly` cookie
- session restore after page reload
- active device/session list
- revoke individual sessions
- profile editing
- avatar update
- delete account from profile with explicit confirmation

### Chats and contacts

- server-backed contacts
- direct chats
- group chats
- add members to existing groups
- group info sheet
- separate group participants sheet
- add members from contacts through info/member sheets
- archive chat for self
- delete chat for self
- archive contains only chats and groups explicitly archived by the user
- direct chat shows in the dialogs list after the first message
- group chat shows in the groups list immediately after creation
- unread counters

### Messages

- end-to-end encrypted text messages
- message history with pagination
- optimistic send in the UI
- delivered/read receipts
- typing indicator
- typing publish over `WebSocket/STOMP` with HTTP read fallback when realtime is unavailable
- reactions: `LIKE`, `DISLIKE`, `EYES`, `OK`
- reply to message
- edit own message
- forward to another chat or group
- pin and unpin message
- delete for self
- delete for everyone in direct chats
- delete own message for everyone in groups
- pinned message banner with jump-to-message behavior inside the chat stream
- realtime delivery through `WebSocket/STOMP`
- HTTP endpoints remain authoritative for auth, message mutations, and recovery sync
- Redis-backed websocket fan-out is available for production scale-out

### Video conferences

- instant conference
- schedule conference
- invite participants
- conference becomes joinable 5 minutes before scheduled start
- embedded same-origin Jitsi stage inside the app
- in-app join path with per-room access code
- group-wide start/schedule actions
- active list shows only ongoing and scheduled conferences you participate in

### UI

- Telegram-like split layout
- dialogs / groups / conferences tabs
- archive screen
- contacts screen
- sessions screen
- pinned message banner at the top of the chat
- reply preview block inside messages
- avatars for incoming messages
- right-click context menu for:
  - reply
  - edit
  - forward
  - pin / unpin
  - copy
  - delete for self
  - delete for everyone / for both sides where allowed

## Security and E2EE

- direct chats use client-side `X3DH-DEVICE-AES-GCM` transport envelopes
- group chats use client-side `GROUP-SENDER-KEY-AES-GCM` shared envelopes
- backend stores encrypted payloads and wrapped per-device transport payloads
- refresh token is not stored in `localStorage`
- access token is kept in client memory
- password-based E2EE unlock is available at any time
- trusted-device unlock via `WebAuthn` / Windows Hello / Touch ID / passkey is supported
- trusted-device flow stores only an encrypted local copy and still requires platform verification to unwrap
- trusted-device unlock auto-starts on reopen and falls back to password only if the platform flow fails or the user chooses it
- auth endpoints have extra protection against cross-site requests and brute-force bursts

Important limitations:

- this is not a hardened high-assurance messenger yet
- metadata is still visible to the server: participants, timestamps, receipts, typing, chat membership
- message storage is still monolithic PostgreSQL on a single primary node
- conference/media stack still shares the same host unless you split it operationally

## Realtime Model

- one long-lived `WebSocket/STOMP` connection per client session
- message creation is HTTP-authoritative
- websocket delivers inbound chat updates, receipts, and typing broadcasts
- message acknowledgement uses `clientMessageId`
- Redis pub/sub can fan-out outbound websocket events across backend instances
- typing state uses short-lived TTL entries and can be shared through Redis
- chat list and message list still perform recovery sync, but polling has been reduced when realtime is healthy
- typing participant reads can fall back to `GET /api/chats/{chatId}/typing` when realtime is disconnected

## Observability

- `Spring Boot Actuator` is enabled
- health endpoint: `/actuator/health`
- Prometheus scrape endpoint: `/actuator/prometheus`
- optional production observability profile includes:
  - `Prometheus`
  - `Grafana`
  - `Tempo`
  - `OpenTelemetry Collector`
  - `Alertmanager`
  - `Loki`
  - `Promtail`
  - `postgres-exporter`
- custom backend latency/counter metrics:
  - `messenger.message.send.duration`
  - `messenger.message.send.total`
  - `messenger.message.dispatch.duration`
  - `messenger.message.dispatch.total`
  - `messenger.chat.summary.broadcast.duration`
  - `messenger.chat.summary.broadcast.total`
- executor metrics for async message fan-out:
  - `messenger.message.dispatch.executor.*`
- slow-path warnings are logged for:
  - message persistence before dispatch
  - post-commit message fan-out
  - chat summary broadcast
- production backend logs run in structured JSON mode
- Promtail ships Docker logs into Loki
- provisioned Grafana dashboard tracks:
  - message send p95
  - message dispatch p95
  - backend HTTP p95
  - backend 5xx rate
  - conference archive request rate
  - JVM heap
- Prometheus alert rules cover:
  - backend down
  - postgres exporter down
  - high message send p95
  - high dispatch p95
  - backend 5xx rate
  - conference archive hot-path traffic
- Alertmanager is included and can forward externally through `ALERTMANAGER_WEBHOOK_URL`

Current note:

- `/actuator/health` is public
- `/actuator/prometheus` is protected with internal basic auth for Prometheus scrape
- `edge` blocks external `/actuator/*` requests, so metrics stay off the public internet
- backend logs include `traceId` / `spanId` correlation and run in structured JSON in production
- on small hosts, observability should stay disabled by default and be enabled only for short diagnostic windows
- when observability is disabled, the `Production WebSocket Guard` GitHub Actions workflow serves as a lightweight websocket anomaly alert
- that workflow checks recent `/ws` access logs over SSH and fails if reconnect or `429` rates cross configured thresholds
- these alerts show up in GitHub Actions; delivery outside GitHub requires either GitHub notifications/email settings or a separate Alertmanager webhook on a larger observability-enabled host

Production note:

- Grafana is intended to be published through `https://<APP_DOMAIN>/observability/`
- Prometheus, Tempo, Alertmanager, Loki, Promtail, Postgres exporter, and the OTLP collector stay internal to the Docker network
- traces are viewed through `Grafana -> Explore -> Tempo`
- logs are viewed through `Grafana -> Explore -> Loki`
- production compose always includes Redis for shared realtime state and fan-out
- production deploy ensures `postgres`, `redis`, and the core Jitsi containers are running before recreating `web`, `backend`, and `edge`
- production Docker logs use bounded `json-file` rotation through `DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILE`
- repository helpers are included for local-on-server production backups with PostgreSQL dumps, config snapshots, and small volume archives
- on `2 GB RAM` servers, keep `ENABLE_OBSERVABILITY_STACK=false` and `MANAGEMENT_TRACING_ENABLED=false`
- the default core production memory budget is intentionally kept around `1.5 GB` to leave headroom for the OS and Docker daemon

## Video Conference Notes

- scheduled conferences open 5 minutes before start time
- invited users join from inside the app
- direct public share flow has been removed from the main UI
- current protection is practical app-level access control plus room access code, not full Jitsi JWT auth
- active conference list intentionally hides ended conferences
- ended conferences are not auto-moved into archive

For autonomous recording:

- run `Jibri` with the `autonomous-recording` profile
- this is expected to work properly on Linux hosts
- plain Docker Desktop on Windows is not a reliable target for full Jibri recording

## What Is Not Implemented

- file attachments and media uploads
- push notifications
- distributed presence / last seen service
- external durable event bus such as Kafka for large-scale asynchronous pipelines
- true server-side Jitsi JWT admission control

## Project Layout

- `backend` - Spring Boot application
- `web` - React/Vite frontend
- `jitsi` - Jitsi config used by local compose
- `deploy/observability` - Prometheus / Grafana / Tempo / Loki / Alertmanager / Collector config
- `docs` - supplementary architecture notes

Main backend areas:

- `application.auth`
- `application.chat`
- `application.message`
- `application.e2ee`
- `security`
- `config`

## Run with Docker Compose

Requirements:

- Docker Desktop

Start the default stack:

```bash
docker compose up --build
```

Services:

- web: `http://localhost:3000`
- backend API: `http://localhost:8080`
- backend health: `http://localhost:8080/actuator/health`
- Jitsi web: `http://localhost:8090`

Optional Redis profile:

```bash
APP_REALTIME_REDIS_ENABLED=true docker compose --profile redis up --build
```

Autonomous recording profile:

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

## Run Backend and Web Locally

Requirements:

- Java 17+
- Maven 3.9+
- Node.js LTS
- Docker Desktop for infrastructure

Start infrastructure only:

```bash
docker compose up -d postgres
```

Optional Redis:

```bash
APP_REALTIME_REDIS_ENABLED=true docker compose --profile redis up -d redis
```

Run backend:

```bash
cd backend
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
```

Run frontend:

```bash
cd web
npm install
npm run dev
```

Default local URLs:

- backend: `http://localhost:8080`
- frontend dev server: `http://localhost:5173`

## Environment

Important variables:

- `SERVER_PORT`
- `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`
- `APP_CORS_ALLOWED_ORIGINS`
- `APP_JWT_SECRET`
- `APP_ACTUATOR_SCRAPE_USERNAME`
- `APP_ACTUATOR_SCRAPE_PASSWORD`
- `ALERTMANAGER_WEBHOOK_URL`
- `DOCKER_LOG_MAX_SIZE`
- `DOCKER_LOG_MAX_FILE`
- `APP_JWT_REFRESH_TOKEN_TTL`
- `APP_AUTH_REFRESH_COOKIE_NAME`
- `APP_AUTH_REFRESH_COOKIE_PATH`
- `APP_AUTH_REFRESH_COOKIE_SAME_SITE`
- `APP_AUTH_REFRESH_COOKIE_SECURE`
- `APP_AUTH_REGISTRATION_ALLOWED_EMAIL_DOMAINS`
- `APP_AUTH_PASSWORD_RESET_ENABLED`
- `APP_AUTH_PASSWORD_RESET_TOKEN_TTL`
- `APP_AUTH_PASSWORD_RESET_URL_BASE`
- `APP_AUTH_PASSWORD_RESET_FROM_ADDRESS`
- `SPRING_MAIL_HOST`
- `SPRING_MAIL_PORT`
- `SPRING_MAIL_USERNAME`
- `SPRING_MAIL_PASSWORD`
- `SPRING_MAIL_SMTP_AUTH`
- `SPRING_MAIL_SMTP_SSL_ENABLE`
- `SPRING_MAIL_SMTP_STARTTLS_ENABLE`
- `APP_MEDIA_CONFERENCE_RECORDINGS_DIRECTORY`
- `APP_MEDIA_CONFERENCE_RECORDINGS_IMPORT_DIRECTORY`
- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_JITSI_BASE_URL`

Use:

- `.env.example` for base defaults
- `.env.prod.example` for production-like deployment

Registration only allows email domains listed in `APP_AUTH_REGISTRATION_ALLOWED_EMAIL_DOMAINS`.
The default examples include common public providers and can be overridden with a comma-separated list.

## Password Reset Email Setup

Password reset emails now require a real SMTP mailbox. There is no built-in local mail sink anymore.

Local setup:

1. Copy `.env.example` to `.env`
2. Fill in your real SMTP mailbox and password or app password
3. Set `APP_AUTH_PASSWORD_RESET_ENABLED=true`
4. Set `APP_AUTH_PASSWORD_RESET_URL_BASE` to the frontend URL you actually use

Use:

- `http://localhost:3000/` for the bundled web container
- `http://localhost:5173/` for `npm run dev`

Minimal local `.env` example:

```bash
APP_AUTH_PASSWORD_RESET_ENABLED=true
APP_AUTH_PASSWORD_RESET_URL_BASE=http://localhost:3000/
APP_AUTH_PASSWORD_RESET_FROM_ADDRESS=your-address@gmail.com
SPRING_MAIL_HOST=smtp.gmail.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=your-address@gmail.com
SPRING_MAIL_PASSWORD=YOUR_GOOGLE_APP_PASSWORD
SPRING_MAIL_SMTP_AUTH=true
SPRING_MAIL_SMTP_SSL_ENABLE=false
SPRING_MAIL_SMTP_STARTTLS_ENABLE=true
```

Verification with Docker Compose:

```bash
docker compose up --build
```

Verification with local backend and local frontend:

```bash
cd backend
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
```

```bash
cd web
npm install
npm run dev
```

Notes:

- Docker Compose reads `.env` automatically
- `mvn spring-boot:run` now also reads the repo-root `.env` automatically, so the same SMTP settings work for both Docker and local backend runs
- the app sends through one configured SMTP mailbox; recipients can use any email provider
- Thunderbird only shows the message after your SMTP provider accepts delivery to the target mailbox; the app does not send mail directly to Thunderbird
- the reset request endpoint stays privacy-safe and always returns success-shaped responses, so delivery problems show up in backend logs instead of the API body
- if the API says the reset request was accepted but no message arrives, check backend logs first for SMTP auth, connection, or disabled-feature warnings

Production deployments should use real SMTP credentials and a public reset URL, for example:

- `APP_AUTH_PASSWORD_RESET_ENABLED=true`
- `APP_AUTH_PASSWORD_RESET_URL_BASE=https://your-domain.example/`
- `APP_AUTH_PASSWORD_RESET_FROM_ADDRESS=no-reply@your-domain.example`
- `SPRING_MAIL_HOST=smtp.example.com`
- `SPRING_MAIL_PORT=587`
- `SPRING_MAIL_USERNAME=no-reply@your-domain.example`
- `SPRING_MAIL_PASSWORD=...`

Important:

- the app uses one configured outgoing mailbox for sending reset emails
- recipients can use any email provider; you do not need per-user SMTP settings
- for providers that require implicit SSL on port `465`, set `SPRING_MAIL_SMTP_SSL_ENABLE=true`
- for providers that use STARTTLS on port `587`, set `SPRING_MAIL_SMTP_STARTTLS_ENABLE=true`

Examples for common providers:

Gmail or Google Workspace via `smtp.gmail.com`:

```bash
export APP_AUTH_PASSWORD_RESET_FROM_ADDRESS='your-address@gmail.com'
export SPRING_MAIL_HOST='smtp.gmail.com'
export SPRING_MAIL_PORT='587'
export SPRING_MAIL_USERNAME='your-address@gmail.com'
export SPRING_MAIL_PASSWORD='YOUR_GOOGLE_APP_PASSWORD'
export SPRING_MAIL_SMTP_AUTH='true'
export SPRING_MAIL_SMTP_SSL_ENABLE='false'
export SPRING_MAIL_SMTP_STARTTLS_ENABLE='true'
```

Microsoft 365 / Outlook mailbox via `smtp.office365.com`:

```bash
export APP_AUTH_PASSWORD_RESET_FROM_ADDRESS='your-address@your-domain.example'
export SPRING_MAIL_HOST='smtp.office365.com'
export SPRING_MAIL_PORT='587'
export SPRING_MAIL_USERNAME='your-address@your-domain.example'
export SPRING_MAIL_PASSWORD='YOUR_SMTP_PASSWORD_OR_APP_PASSWORD'
export SPRING_MAIL_SMTP_AUTH='true'
export SPRING_MAIL_SMTP_SSL_ENABLE='false'
export SPRING_MAIL_SMTP_STARTTLS_ENABLE='true'
```

Yahoo Mail via `smtp.mail.yahoo.com`:

```bash
export APP_AUTH_PASSWORD_RESET_FROM_ADDRESS='your-address@yahoo.com'
export SPRING_MAIL_HOST='smtp.mail.yahoo.com'
export SPRING_MAIL_PORT='587'
export SPRING_MAIL_USERNAME='your-address@yahoo.com'
export SPRING_MAIL_PASSWORD='YOUR_YAHOO_APP_PASSWORD'
export SPRING_MAIL_SMTP_AUTH='true'
export SPRING_MAIL_SMTP_SSL_ENABLE='false'
export SPRING_MAIL_SMTP_STARTTLS_ENABLE='true'
```

Yandex Mail via `smtp.yandex.com`:

```bash
export APP_AUTH_PASSWORD_RESET_FROM_ADDRESS='your-address@yandex.ru'
export SPRING_MAIL_HOST='smtp.yandex.com'
export SPRING_MAIL_PORT='465'
export SPRING_MAIL_USERNAME='your-address@yandex.ru'
export SPRING_MAIL_PASSWORD='YOUR_YANDEX_PASSWORD_OR_APP_PASSWORD'
export SPRING_MAIL_SMTP_AUTH='true'
export SPRING_MAIL_SMTP_SSL_ENABLE='true'
export SPRING_MAIL_SMTP_STARTTLS_ENABLE='false'
```

Mail.ru via `smtp.mail.ru`:

```bash
export APP_AUTH_PASSWORD_RESET_FROM_ADDRESS='your-address@mail.ru'
export SPRING_MAIL_HOST='smtp.mail.ru'
export SPRING_MAIL_PORT='465'
export SPRING_MAIL_USERNAME='your-address@mail.ru'
export SPRING_MAIL_PASSWORD='YOUR_MAIL_RU_APP_PASSWORD'
export SPRING_MAIL_SMTP_AUTH='true'
export SPRING_MAIL_SMTP_SSL_ENABLE='true'
export SPRING_MAIL_SMTP_STARTTLS_ENABLE='false'
```

iCloud Mail via `smtp.mail.me.com`:

```bash
export APP_AUTH_PASSWORD_RESET_FROM_ADDRESS='your-address@icloud.com'
export SPRING_MAIL_HOST='smtp.mail.me.com'
export SPRING_MAIL_PORT='587'
export SPRING_MAIL_USERNAME='your-address@icloud.com'
export SPRING_MAIL_PASSWORD='YOUR_APP_SPECIFIC_PASSWORD'
export SPRING_MAIL_SMTP_AUTH='true'
export SPRING_MAIL_SMTP_SSL_ENABLE='false'
export SPRING_MAIL_SMTP_STARTTLS_ENABLE='true'
```

## Production Notes

- set a stable `APP_JWT_SECRET`
- in production it must be a valid Base64 secret with at least 32 bytes after decoding
- set explicit `APP_ACTUATOR_SCRAPE_USERNAME` and `APP_ACTUATOR_SCRAPE_PASSWORD` for internal Prometheus auth
- production compose fails closed if those scrape credentials are missing
- leave `ENABLE_OBSERVABILITY_STACK=false` on small servers unless you intentionally want to spend RAM on Grafana/Prometheus/Tempo/Loki
- leave `MANAGEMENT_TRACING_ENABLED=false` on small servers unless the observability stack is enabled
- set `ALERTMANAGER_WEBHOOK_URL` if you want Alertmanager notifications to leave the server
- use `docker-compose.prod.yml` with `.env.prod`
- refresh cookie secure mode is expected in production
- keep `.env.prod` only on the server
- prefer a dedicated `deploy` user with SSH key auth over `root + password`
- install the included backup timer and review [deploy/BACKUPS.md](deploy/BACKUPS.md)
- use the manual GitHub Actions deploy workflow instead of long interactive SSH sessions
- see [deploy/PRODUCTION.md](deploy/PRODUCTION.md) for the production runbook
- server bootstrap helpers live in [deploy](deploy)

## Current Constraints

- realtime broker is the in-process Spring broker
- Redis pub/sub is available for fan-out, but this is still not a full external broker architecture
- typing can be shared through Redis, but presence/last-seen are still not separate distributed services
- no distributed presence store yet
- backend verification in this workspace is limited by environment availability; web checks are the easiest to run locally

## Practical Manual Checks

1. Register `user1`.
2. Register `user2` in another browser profile/incognito window.
3. Open a direct chat from `user1` to `user2`.
4. Send the first message.
5. Verify the dialog appears in the dialogs list for both sides.
6. Verify typing indicator.
7. Verify delivered/read status.
8. Verify reactions, reply, edit, forward, pin, and delete actions on messages.
9. Verify delete chat for self.
10. Create a group, open the group info sheet, and add a participant from contacts.
11. Start or schedule a conference from the group.
12. Verify the conference becomes available 5 minutes before start and ended conferences disappear from the active conference list.
13. Reopen the browser and verify trusted-device unlock uses the platform prompt instead of password-first flow.
14. Delete the test account from profile if you want to clean up test data without direct DB access.

## Verification Used During Development

The web client has been repeatedly checked with:

- `npm run typecheck`
- `npm run test:run`
- `npm run build`

Backend verification depends on having `mvn`/Docker available in the local environment.
