# Architecture Notes

## Overview

This repository is a modular monolith:

- `backend`: Spring Boot application
- `web`: React + TypeScript client
- `postgres`: transactional source of truth
- `redis`: optional realtime fan-out and rate-limit support
- `jitsi`: conference stack

The system uses a `server-trusted` messaging model. Clients send plain payloads, the server stores readable content, and recipients receive already-hydrated message payloads.

## Backend modules

- `api`: REST controllers, websocket controllers, DTOs
- `application.auth`: registration, login, sessions, profile, password flows
- `application.chat`: chat listing, direct/group management, moderation, workspace search
- `application.message`: send, query, receipts, reactions, attachments, dispatch outbox
- `application.push`: Web Push subscriptions and generic notification delivery
- `domain`: entities and repositories
- `security`: JWT auth and websocket auth
- `config`: Spring configuration and exception handling
- `observability`: metrics and telemetry

## Message flow

1. Client asks backend for an attachment upload target if files are present.
2. Client uploads attachment blobs directly to the MinIO-backed `/storage` path using a presigned URL.
3. Client sends the message over WebSocket/STOMP with `plainPayload`, `clientMessageId`, optional `replyToMessageId`, and optional `attachmentIds`.
4. Backend validates membership, payload, reply visibility, attachment ownership, and uploaded-object existence.
5. Backend persists the message and queues dispatch through `message_dispatch_outbox`.
6. Backend sends realtime updates and sender acknowledgements; query APIs return plain payloads directly.

## Realtime

- WebSocket/STOMP is the canonical message send path.
- HTTP remains in use for history/query APIs, attachment target issuance, downloads, typing state snapshots, and non-send mutations.
- In multi-replica mode, backend instances fan out signed realtime events through Redis.

## Storage model

- `chat_messages.content` stores readable message content
- `chat_attachments` stores attachment metadata and storage keys
- `message_dispatch_outbox` handles post-commit delivery
- group prejoin history is enforced by membership timestamps and `prejoin_history_policy`

## Scaling boundary

Safe current target:

- multiple `backend` replicas on one Docker host
- multiple `web` replicas on one Docker host

Still singleton or host-local:

- Postgres
- Redis
- Jitsi services
- Docker-volume conference recording storage

Attachment metadata stays in Postgres while attachment blobs live behind the MinIO-backed S3-compatible storage layer.
Moving to multiple physical hosts still requires an object-storage strategy for conference recordings.
