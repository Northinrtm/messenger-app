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
- direct chat shows in the dialogs list after the first message
- group chat shows in the groups list immediately after creation
- unread counters

### Messages

- end-to-end encrypted text messages
- message history with pagination
- optimistic send in the UI
- delivered/read receipts
- typing indicator
- websocket-only typing signals
- reactions: `LIKE`, `DISLIKE`, `EYES`, `OK`
- reply to message
- edit own message
- forward to another chat or group
- pin and unpin message
- delete for self
- delete for everyone in direct chats
- delete own message for everyone in groups
- realtime delivery through `WebSocket/STOMP`
- HTTP fallback kept only for the remaining sensitive flows where needed

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
- right-click context menu for:
  - reply
  - edit
  - forward
  - pin / unpin
  - copy
  - delete for self
  - delete for everyone / for both sides where allowed

## Security and E2EE

- message content is encrypted client-side with `RSA-OAEP + AES-GCM`
- backend stores encrypted payloads and wrapped per-user keys
- refresh token is not stored in `localStorage`
- access token is kept in client memory
- password-based E2EE unlock is available at any time
- trusted-device unlock via `WebAuthn` / Windows Hello / Touch ID / passkey is supported
- trusted-device flow stores only an encrypted local copy and still requires platform verification to unwrap
- auth endpoints have extra protection against cross-site requests and brute-force bursts

Important limitations:

- this is not a hardened high-assurance messenger yet
- metadata is still visible to the server: participants, timestamps, receipts, typing, chat membership
- realtime fan-out and typing are currently designed for a single backend instance, not horizontal scale-out

## Realtime Model

- one long-lived `WebSocket/STOMP` connection per client session
- message send path is realtime-first
- message acknowledgement uses `clientMessageId`
- chat list and message list still perform periodic sync to avoid stale UI state
- typing is short-lived state with TTL and WebSocket-only transport

## Observability

- `Spring Boot Actuator` is enabled
- health endpoint: `/actuator/health`
- metrics endpoint: `/actuator/metrics`
- Prometheus scrape endpoint: `/actuator/prometheus`
- production observability stack includes:
  - `Prometheus`
  - `Grafana`
  - `Tempo`
  - `OpenTelemetry Collector`
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
- provisioned Grafana dashboard tracks:
  - message send p95
  - message dispatch p95
  - backend HTTP p95
  - backend 5xx rate
  - typing HTTP fallback traffic
  - conference archive request rate
  - JVM heap
- Prometheus alert rules cover:
  - backend down
  - postgres exporter down
  - high message send p95
  - high dispatch p95
  - backend 5xx rate
  - unexpected HTTP typing traffic
  - conference archive hot-path traffic

Current note:

- `/actuator/health` is public
- scrape endpoints are exposed on the backend container for internal Prometheus access
- `edge` blocks external `/actuator/*` requests, so metrics stay off the public internet

Production note:

- Grafana is intended to be published through `https://<APP_DOMAIN>/observability/`
- Prometheus, Tempo, Postgres exporter, and the OTLP collector stay internal to the Docker network
- traces are viewed through `Grafana -> Explore -> Tempo`

## Video Conference Notes

- scheduled conferences open 5 minutes before start time
- invited users join from inside the app
- direct public share flow has been removed from the main UI
- current protection is practical app-level access control plus room access code, not full Jitsi JWT auth
- active conference list intentionally hides ended conferences

For autonomous recording:

- run `Jibri` with the `autonomous-recording` profile
- this is expected to work properly on Linux hosts
- plain Docker Desktop on Windows is not a reliable target for full Jibri recording

## What Is Not Implemented

- file attachments and media uploads
- push notifications
- distributed presence / last seen service
- external message broker for horizontal realtime scale
- true server-side Jitsi JWT admission control

## Project Layout

- `backend` - Spring Boot application
- `web` - React/Vite frontend
- `jitsi` - Jitsi config used by local compose
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
docker compose --profile redis up --build
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
- `APP_JWT_REFRESH_TOKEN_TTL`
- `APP_AUTH_REFRESH_COOKIE_NAME`
- `APP_AUTH_REFRESH_COOKIE_PATH`
- `APP_AUTH_REFRESH_COOKIE_SAME_SITE`
- `APP_AUTH_REFRESH_COOKIE_SECURE`
- `APP_MEDIA_CONFERENCE_RECORDINGS_DIRECTORY`
- `APP_MEDIA_CONFERENCE_RECORDINGS_IMPORT_DIRECTORY`
- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_JITSI_BASE_URL`

Use:

- `.env.example` for base defaults
- `.env.prod.example` for production-like deployment

## Production Notes

- set a stable `APP_JWT_SECRET`
- in production it must be a valid Base64 secret with at least 32 bytes after decoding
- use `docker-compose.prod.yml` with `.env.prod`
- refresh cookie secure mode is expected in production
- keep `.env.prod` only on the server
- prefer a dedicated `deploy` user with SSH key auth over `root + password`
- use the manual GitHub Actions deploy workflow instead of long interactive SSH sessions
- see [deploy/PRODUCTION.md](/d:/programs/coding/VSprojects/messenger-app/deploy/PRODUCTION.md) for the production runbook
- server bootstrap helpers live in [deploy](/d:/programs/coding/VSprojects/messenger-app/deploy)

## Current Constraints

- realtime broker is the in-process Spring broker
- typing state is held in backend memory with cleanup TTL
- no multi-node realtime fan-out layer yet
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

## Verification Used During Development

The web client has been repeatedly checked with:

- `npm run typecheck`
- `npm run test:run`
- `npm run build`

Backend verification depends on having `mvn`/Docker available in the local environment.
