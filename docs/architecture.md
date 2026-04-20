# Architecture Notes

## Current shape

This repository is a production-style MVP for a direct-message messenger:

- `backend`: Spring Boot monolith with modular packages
- `web`: React + TypeScript client
- `postgres`: source of truth for users, chats, memberships and messages
- `redis`: reserved for presence, fan-out and future scale-out work

## Backend modules

- `api`: REST endpoints and DTOs
- `application.auth`: registration, login and JWT issuing
- `application.chat`: chat listing, direct/group chats, video conferences and recording import
- `application.message`: message history, sending, receipts and typing state
- `application.e2ee`: user encryption key bundles and public key resolution
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

## Why the backend is a modular monolith

For the first serious release this is the right trade-off:

- one deployment unit
- one transactional data model
- simpler observability and debugging
- lower coordination overhead than microservices

The scaling boundary is still clear: auth, chat metadata, realtime fan-out, notifications and media can be split later.

## Production hardening path

- move the simple broker to a dedicated broker or websocket cluster
- add Redis-backed presence, typing indicators and fan-out
- add Kafka or NATS for async delivery pipelines
- add object storage for attachments
- add moderation events and richer media workflows
- expand integration tests for conference recording import and delivery flows
- expand integration tests with Testcontainers and enforce CI pipelines
