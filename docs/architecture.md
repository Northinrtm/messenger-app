# Architecture Notes

## Current shape

This repository is a production-style MVP for a direct-message messenger:

- `backend`: Spring Boot monolith with modular packages
- `web`: React + TypeScript client
- `postgres`: source of truth for users, chats, memberships and messages
- `redis`: production realtime fan-out path and future presence/scale-out foundation

The production compose topology now supports scaling `backend` and `web` replicas on one Docker host.
`postgres`, `redis`, `edge`, and the bundled Jitsi stack remain singleton services in that topology.

## Backend modules

- `api`: REST endpoints and DTOs
- `application.auth`: registration, login and JWT issuing
- `application.chat`: chat listing, direct/group chats, video conferences and recording import
- `application.message`: message history, sending, receipts, typing state and encrypted attachments
- `application.e2ee`: user encryption key bundles and public key resolution
- `application.push`: Web Push subscriptions and generic notification delivery
- `domain`: entities and repositories
- `security`: stateless JWT auth for HTTP requests
- `config`: CORS, WebSocket STOMP broker and exception handling

## Realtime flow

1. Client authenticates through `POST /api/auth/register` or `POST /api/auth/login`.
2. Backend issues an access token plus a rotatable refresh token bound to a stored user session.
3. Client keeps the session locally and refreshes the access token before expiry.
4. HTTP API uses the JWT filter for protected endpoints.
5. WebSocket/STOMP connects to `/ws` with `Authorization: Bearer <token>`.
6. The channel interceptor validates the token on `CONNECT`, re-validates the bound session on later frames, and validates membership on `SUBSCRIBE`.
7. Sending a message goes through WebSocket/STOMP `SEND /app/chats/{chatId}/messages` with a required stable `clientMessageId`.
8. Backend persists the message, emits an explicit sender ack to `/user/queue/message-acks`, and emits explicit sender errors to `/user/queue/message-errors`.
9. Recipient realtime delivery stays on `/user/queue/messages`, and history/chat summaries use authoritative `serverOrder` from persistence.
10. If Web Push is enabled, recipients with saved subscriptions receive a generic no-plaintext notification outside the websocket path.
11. In production multi-replica mode, backend instances publish signed realtime events to Redis and each instance delivers only to its local websocket sessions.

## Horizontal scaling model

The current safe scaling target is single-host Docker Compose:

- `backend`: horizontally scalable when Redis realtime is enabled and all replicas share `APP_JWT_SECRET` plus `APP_REALTIME_REDIS_MAC_SECRET`
- `web`: horizontally scalable behind the `edge` service; nginx resolves `backend` through Docker DNS
- auth endpoint rate limits: JVM-local by default, Redis-backed when `APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true`
- websocket session revocation: local Spring events plus signed Redis fan-out when Redis realtime is enabled
- scheduled backend jobs: protected by Postgres transaction advisory locks
- conference maintenance: activation/start/end and recording import run through scheduled jobs, not read requests
- direct chat creation: protected by a canonical database pair and unique index
- Prometheus: discovers backend replicas through Docker DNS

Operational limits:

- Docker volumes for attachments and recordings are host-local, so multi-host app replicas need object storage first.
- The bundled Jitsi stack is still singleton-oriented.
- Redis is used for realtime fan-out, not as a durable event log.
- Postgres remains the transactional source of truth.

## Why the backend is a modular monolith

For the first serious release this is the right trade-off:

- one deployment unit
- one transactional data model
- simpler observability and debugging
- lower coordination overhead than microservices

The scaling boundary is still clear: auth, chat metadata, realtime fan-out, notifications and media can be split later.

## Production hardening path

- move attachment and recording storage to S3/MinIO-compatible object storage
- add distributed presence/last-seen on Redis
- move the simple broker to a dedicated broker or websocket cluster if Redis fan-out becomes insufficient
- add Kafka or NATS for async delivery pipelines
- add encrypted service-worker push previews without exposing plaintext to the backend
- add moderation events and richer media workflows
- expand integration tests for conference recording import and delivery flows
- expand integration tests with Testcontainers and enforce CI pipelines
