# Functional Requirements

## Product goal

`Messenger App` is a realtime messenger that lets users:

- register and sign in
- communicate in direct and group chats
- send text messages and file attachments
- receive realtime updates and notifications
- manage contacts, blocks, drafts, archives, and group membership
- join conferences

## Messaging model

The system uses a `server-trusted` model:

- clients send plain message payloads
- the backend stores message content in readable form
- the backend is authoritative for history, ordering, receipts, and delivery
- the product must not promise E2EE semantics

## Account and session requirements

The product must support:

- registration with domain allowlist checks
- login with username and password
- refreshable sessions
- session listing and session revocation
- profile update and avatar update
- password change
- password reset by email
- email verification when enabled
- account deletion

## Chat requirements

The product must support:

- direct chats
- group chats
- group owners and moderators
- bans and invite links
- `JOIN_ONLY` and `FULL_HISTORY` prejoin-history policy
- unread counters
- archive-for-self and delete-chat-for-self
- per-chat drafts

## Message requirements

The product must support:

- send message
- idempotent resend by `clientMessageId`
- reply
- edit
- pin and unpin
- forward
- reactions
- delete for self
- delete for everyone where allowed
- typing indicators
- delivered and read receipts

The backend must remain authoritative for:

- ordering by `serverOrder`
- visibility after reload
- message status after reconnect

## Attachment requirements

The product must support:

- attachment upload before message send
- attachment-to-message linking
- image preview
- safe orphan cleanup for unattached uploads
- size limits configured on the backend

## Push requirements

The product must support Web Push subscriptions.

Push payloads sent by the backend must remain generic and must not contain message text previews.

## Conference requirements

The product must support:

- instant conferences
- scheduled conferences
- participant invites
- Jitsi embed
- recording import and archive download flow

## Access control requirements

The backend must enforce:

- chat membership checks
- moderator and owner permissions
- blocked-user messaging restrictions
- message ownership checks for mutable actions
- attachment ownership and chat ownership checks

## Non-goals for the current model

The current product does not require:

- client-side message decryption
- browser-local message unlock flows
- client-managed message keys
- client-managed message recovery flows
