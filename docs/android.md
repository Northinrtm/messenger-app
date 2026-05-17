# Android App Plan

## Goal

Build a supported Android client with:

- full chat workflow
- native mobile push
- in-app conferences and calls
- production-grade lifecycle, permissions, and file handling

This is not a thin WebView wrapper around the current web client.

## Support Matrix

- supported: `web`, `android-app`
- legacy / unsupported target: `desktop` (`web/src-tauri`)

## Technical Direction

- client stack: `React Native CLI` + `TypeScript`
- navigation: native mobile navigation stack
- mobile call surface: `Jitsi React Native SDK`
- notifications: `FCM`
- secure local secrets: Android keystore-backed storage
- shared code: extract API contracts, validation, formatting, and non-UI domain helpers into a shared package

`React Native` is preferred over a WebView-style wrapper because the current conference flow is iframe-based Jitsi and browser-device APIs. That is not sufficient for a high-quality Android in-app calling experience.

## Target Repository Shape

- `backend` - existing Spring Boot backend
- `web` - browser client
- `android-app` - new React Native Android client
- `packages/shared` - shared TS contracts/helpers reused by `web` and `android-app`

## Android MVP

The first releasable Android build must support:

- register, login, refresh, logout
- direct chats and group chats
- chat list, chat open, message history paging
- send, retry, edit, reply, forward, reactions, receipts
- drafts and pending outgoing messages
- attachments upload/download/preview/share
- contacts, search, archive, block
- conference list, conference open, in-app join/leave
- push notifications for messages and conference entry
- session revoke handling and forced logout handling

Not required for the first Android release:

- mailbox UI parity if it slows down core chat/call delivery
- local conference recording import/download parity on day one
- desktop support or desktop feature work

## Current State

Implemented now:

- `android-app` React Native CLI scaffold
- `packages/shared` extracted TypeScript contracts
- mobile JSON auth endpoints in backend
- Android secure refresh-token storage with `react-native-keychain`
- startup session restore through `/api/mobile/auth/refresh`
- workspace shell with `Chats / Contacts / Conferences / Profile` sections
- workspace search plus basic archive/block actions on Android, using the existing backend search/chat/user endpoints
- contact add/remove plus direct-chat start/open on Android, using existing `/api/users/contacts*` and `/api/chats/direct` endpoints
- chat thread read path with `open`, older-message paging, and read acknowledgements
- Android STOMP realtime subscription on `/ws` for chat summaries, messages, message acks/errors, and session events
- text composer with optimistic local sends, failed-send retry, and live incoming message merge
- pending-outgoing persistence wired to backend `user_pending_outgoing_messages`, including recovered failed sends after app restart
- reply/edit composer contexts on Android, with reply reusing the websocket send path and edit using `PUT /api/chats/{chatId}/messages/{messageId}`
- message reactions on Android, using existing `PUT /api/chats/{chatId}/messages/{messageId}/reactions` plus realtime `/user/queue/message-reactions`
- active-chat typing on Android, using STOMP `/app/chats/{chatId}/typing`, realtime `/topic/chats.{chatId}.typing`, composer heartbeats, and a local in-thread typing indicator
- message forward on Android, including inline target selection from the workspace chat list, forwarded-label hydration, and persisted `forwardedFromMessageId` in pending-outgoing recovery/retry
- attachment send/open/share/preview on Android, including document picking, local attachment chips, upload through `/attachments/initiate` + presigned PUT, attachment-only message send, on-demand open via backend `download-url`, system share-sheet handoff for attachment links, and in-app preview for `image/*` attachments
- recovery screen for "session is valid but workspace bootstrap retry is still needed"

Still pending before Sprint 2 can be considered fully closed:

- actual Android native debug assemble on a machine with configured Android SDK

Latest native build check:

- `android-app/android: cmd /c gradlew.bat assembleDebug` currently fails on this workstation because Android SDK is not configured (`ANDROID_HOME` missing and `android/local.properties` not set).

## Required Backend Changes

### 1. Mobile auth contract

Current refresh is browser-cookie based. Android needs an explicit mobile-safe session contract.

Backlog:

- done in Sprint 0: dedicated `POST /api/mobile/auth/{register,login,refresh,logout}` endpoints with refresh token in response body
- keep the web cookie flow untouched for browser clients
- keep session revoke semantics identical to web
- keep websocket auth compatible with bearer token flow

See `docs/mobile-auth.md`.

### 2. Push delivery split

Current push flow is Web Push oriented.

Backlog:

- add Android device registration endpoint and token model for `FCM`
- keep message payloads generic
- add notification routing payload for `chatId` / `conferenceId`
- add conference-start / conference-invite notification events if product needs incoming-call style entry

### 3. Conference mobile contract audit

Backlog:

- verify that current conference create/start/presence APIs are sufficient for mobile entry
- add missing server hints only if the Android client cannot derive state cleanly
- keep backend authoritative for membership, joinability, and conference lifecycle

## Workstreams

### Workstream 1: Mobile app bootstrap

- create `android-app` with React Native + TypeScript
- configure Android package, flavors, icons, signing placeholders, env loading
- add workspace scripts for install, lint, typecheck, test, Android debug build
- add CI verification for the mobile workspace when code exists

### Workstream 2: Shared contracts

- move API types from `web/src/lib/types.ts` into `packages/shared`
- move validation/formatting/domain helpers that are not DOM-specific
- keep web-only and mobile-only adapters outside shared code

### Workstream 3: Auth and session foundation

- implement token/session store with secure local storage
- implement login/register/logout/refresh flow
- add app start session hydration
- handle token expiry and session revoke
- add authenticated websocket token refresh handoff

### Workstream 4: Chat core

- workspace bootstrap
- chat list and archive views
- chat open and paged history
- message composer with reply/edit/forward
- optimistic pending outgoing state with retry
- typing indicators, delivered/read state, unread counters

### Workstream 5: Attachments and media

- file/image picker
- presigned upload flow
- attachment preview and open-in-app / open-with
- download manager integration
- share sheet integration
- Android permission handling for media access

### Workstream 6: Push and notification UX

- FCM token registration
- foreground/background notification handling
- tap-to-open chat or conference
- notification channels
- suppressed duplicate toasts when app is foregrounded

### Workstream 7: Calls and conferences

- conference list and conference detail UI
- prejoin screen with mic/camera toggles
- in-app Jitsi join surface through mobile SDK
- leave/end-for-all controls
- audio route changes: speaker, earpiece, Bluetooth
- lifecycle handling for background / foreground / reconnect
- lock-screen and ongoing-call notification behavior
- permission denial and recovery UX

### Workstream 8: QA and release

- Android device matrix
- crash logging / release logging
- offline / weak-network verification
- Play Store packaging and release checklist

## Sprint Backlog

### Sprint 0: Architecture and bootstrap

- create `android-app`
- choose React Native baseline and Android SDK/toolchain versions
- add `packages/shared`
- extract shared auth/message/chat/conference types
- write ADR-level decision note for mobile auth contract

Exit criteria:

- app builds on Android emulator
- shared package compiles and is consumed by `web`
- no call UI yet

### Sprint 1: Auth + workspace read path

- secure token/session storage
- login/register/logout/refresh
- app startup session restore
- workspace bootstrap
- chat list, contacts, conferences list, profile read-only

Exit criteria:

- user can sign in, reopen app, and see live workspace data

### Sprint 2: Messaging core

- open chat
- page messages
- send/retry/edit/reply
- pending outgoing sync
- typing and receipts
- archive/block/search basics

Exit criteria:

- Android can perform daily chat use cases without browser fallback

### Sprint 3: Attachments + push

- pick/upload attachments
- preview/download/share
- FCM registration and tap routing
- foreground/background notification behavior

Exit criteria:

- message and file workflows work end-to-end on a real Android device

### Sprint 4: In-app calls

- conference list/detail parity
- prejoin UI
- Jitsi mobile SDK embedding
- join/leave/reconnect
- audio route + permissions

Exit criteria:

- user can enter, stay in, and leave a call fully inside the Android app

### Sprint 5: Hardening and beta release

- crash/perf/network hardening
- session edge cases
- deep links for invite links
- QA pass against release checklist
- signed beta build

Exit criteria:

- internal beta quality

## Immediate First Backlog

Start with these concrete tasks:

1. Create `android-app` React Native workspace with TypeScript and Android build scripts.
2. Create `packages/shared` and move `AuthResponse`, chat/message/conference DTO types there.
3. Design and implement mobile auth refresh contract in backend and client.
4. Build Android secure session storage and startup hydration.
5. Implement workspace bootstrap screen and chat list screen.

## Risks

- browser-cookie refresh flow is a bad foundation for mobile unless explicitly adapted
- current web conference embedding cannot be reused as-is for Android call quality
- attachment flows must be re-verified on real Android devices, not only emulator
- push/incoming-call UX may require backend event additions beyond current generic Web Push model
- if shared code extraction is done carelessly, web delivery will stall behind mobile refactors

## Done Definition For Android MVP

- Android app can be installed and used independently of browser UI
- auth/session refresh is stable across app restarts
- core messaging flows work on real devices
- file upload/download works against production-style MinIO URLs
- conference join/leave works inside the app
- notification taps route into the correct chat or conference
- no dependency on `desktop` runtime remains for supported product behavior
