# QA Requirements

## Goal

QA must verify that the server-trusted messaging flow is correct across:

- auth and session recovery
- direct and group chats
- realtime delivery
- message history after reload
- receipts, typing, and reactions
- attachments
- conferences

## Core invariants

- A successfully sent message must appear in the chat stream and remain visible after reload.
- `clientMessageId`, persisted message, and rendered message must stay consistent.
- Fresh messages must not degrade into placeholder content in the supported plain-message flow.
- `Retry` must appear only for actual failed sends.
- Read and delivered status must reflect real receipt state.
- Group prejoin-history policy must be enforced consistently.
- Attachment metadata and file access must stay linked to the owning chat and message.

## Required test areas

### Auth

Verify:

- register
- login
- refresh after reload
- logout
- session list
- revoke session
- email verification
- password reset
- password change
- profile update
- account deletion

### Direct chats

Verify:

- create or reopen direct chat
- send text message
- reply
- edit
- delete
- reactions
- typing
- read and delivered receipts
- reload and reconnect behavior

### Group chats

Verify:

- create group
- add and remove participants
- owner and moderator permissions
- ban and unban
- invite links
- leave group
- `JOIN_ONLY` behavior
- `FULL_HISTORY` behavior
- message send/readback after membership changes

### Attachments

Verify:

- upload
- cancel
- retry-safe path
- orphan cleanup
- image preview
- open/download behavior

### Push

Verify:

- subscribe
- unsubscribe
- generic offline push
- no message text in backend-delivered push payloads

### Conferences

Verify:

- instant conference
- scheduled conference
- join window behavior
- invites
- recording import/download flow

## Smoke checklist for production

1. Open the app and restore a valid session.
2. Send one direct message.
3. Send one group message.
4. Verify both messages remain visible after reload.
5. Verify typing.
6. Verify read or delivered receipt behavior.
7. Verify one `JOIN_ONLY` or `FULL_HISTORY` scenario if the release touched groups.
8. Verify one attachment flow.

## Defect severity guidance

- `Blocker`: message loss, broken auth, unauthorized data access, or persistent realtime failure
- `Critical`: fresh messages fail consistently, history reload is wrong, or group policy is violated
- `Major`: important feature works inconsistently but has a workaround
- `Minor`: cosmetic or non-blocking UX issue
