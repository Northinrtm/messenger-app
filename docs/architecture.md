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
- `application.chat`: chat listing and direct-chat creation
- `application.message`: message history and message sending
- `domain`: entities and repositories
- `security`: stateless JWT auth for HTTP requests
- `config`: CORS, WebSocket STOMP broker and exception handling

## Realtime flow

1. Client authenticates through `POST /api/auth/register` or `POST /api/auth/login`.
2. Backend issues an access token plus a rotatable refresh token bound to a stored user session.
3. Client keeps the session locally and refreshes the access token before expiry.
4. HTTP API uses the JWT filter for protected endpoints.
5. WebSocket/STOMP connects to `/ws` with `Authorization: Bearer <token>`.
6. The channel interceptor validates the token on `CONNECT` and validates membership on `SUBSCRIBE`.
7. Sending a message goes through `POST /api/chats/{chatId}/messages`.
8. Backend persists the message and pushes it to each participant via `/user/queue/messages`.

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
- add message read state, unread counters and moderation events
- expand integration tests with Testcontainers and enforce CI pipelines
