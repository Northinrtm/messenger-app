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
- delete own message for everyone
- realtime delivery through `WebSocket/STOMP`
- HTTP fallbacks for sensitive client flows where needed

### Video conferences

- schedule conference
- invite participants
- conference becomes joinable 5 minutes before scheduled start
- embedded Jitsi stage inside the app
- in-app join path with per-room access code
- conference archive
- server-side recording import flow for `Jibri`
- recording download from the app after import

### UI

- Telegram-like split layout
- dialogs / groups / conferences tabs
- archive screen
- contacts screen
- sessions screen
- right-click context menu for:
  - deleting chat for self
  - deleting own message for everyone

## Security and E2EE

- message content is encrypted client-side with `RSA-OAEP + AES-GCM`
- backend stores encrypted payloads and wrapped per-user keys
- refresh token is not stored in `localStorage`
- access token is kept in client memory
- unlocked private E2EE key is currently kept in `sessionStorage` for the current tab session:
  - survives normal page refresh
  - does not survive full browser/tab lifecycle reset
- auth endpoints have extra protection against cross-site requests and brute-force bursts

Important limitations:

- this is not a hardened high-assurance messenger yet
- metadata is still visible to the server: participants, timestamps, receipts, typing, chat membership
- realtime and typing are currently designed for a single backend instance, not horizontal scale-out

## Realtime Model

- one long-lived `WebSocket/STOMP` connection per client session
- message send path is realtime-first
- message acknowledgement uses `clientMessageId`
- chat list and message list still perform periodic sync to avoid stale UI state
- typing is short-lived state with TTL

## Video Conference Notes

- scheduled conferences open 5 minutes before start time
- invited users join from inside the app
- direct public share flow has been removed from the main UI
- current protection is practical app-level access control plus room access code, not full Jitsi JWT auth

For autonomous recording:

- run `Jibri` with the `autonomous-recording` profile
- this is expected to work properly on Linux hosts
- plain Docker Desktop on Windows is not a reliable target for full Jibri recording

## What Is Not Implemented

- file attachments and media uploads
- reactions
- reply / forward
- message editing
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
8. Verify right-click delete for message.
9. Verify delete chat for self.
10. Create a group and verify it appears in the groups tab.
11. Schedule a conference and verify it becomes available 5 minutes before start.
12. If `Jibri` profile is enabled, verify recording import after the conference ends.

## Verification Used During Development

The web client has been repeatedly checked with:

- `npm run typecheck`
- `npm run test:run`
- `npm run build`

Backend verification depends on having `mvn`/Docker available in the local environment.
