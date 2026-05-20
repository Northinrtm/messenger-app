# ER-диаграмма базы данных

Диаграмма отражает финальное состояние схемы (миграции V1–V9).  
Хранимых процедур и триггеров нет — вся бизнес-логика на уровне Java/Spring.

```mermaid
erDiagram

    %% ── Users & sessions ─────────────────────────────────────────

    app_users {
        uuid    id            PK
        varchar username      "уникальный логин"
        varchar email         "уникальный e-mail"
        varchar display_name  "отображаемое имя"
        varchar password_hash
        bigint  password_version
        boolean mail_enabled  "включена ли почта (V4)"
        timestamptz created_at
        timestamptz email_verified_at
    }

    user_sessions {
        uuid        id         PK
        uuid        user_id    FK
        varchar     token_hash
        varchar     device_name
        timestamptz expires_at
        timestamptz revoked_at
    }

    app_users ||--o{ user_sessions : "открывает сессии"

    %% ── Chats & participants ──────────────────────────────────────

    chat_rooms {
        uuid    id              PK
        varchar title
        boolean is_direct       "true = личный чат"
        uuid    owner_user_id   FK
        uuid    direct_user_low_id  FK
        uuid    direct_user_high_id FK
        varchar prejoin_history_policy "JOIN_ONLY | FULL_HISTORY"
        bigint  membership_version
        timestamptz created_at
    }

    chat_participants {
        uuid        id        PK
        uuid        chat_id   FK
        uuid        user_id   FK
        timestamptz joined_at
        timestamptz left_at   "null = активный участник (V6)"
    }

    app_users   ||--o{ chat_rooms        : "владеет (owner)"
    app_users   ||--o{ chat_rooms        : "участник личного чата (low/high)"
    chat_rooms  ||--o{ chat_participants : "включает"
    app_users   ||--o{ chat_participants : "участвует"

    %% ── Messages ─────────────────────────────────────────────────

    chat_messages {
        uuid    id              PK
        uuid    chat_id         FK
        uuid    sender_id       FK
        bytea   content_ciphertext "зашифровано AES"
        bytea   content_iv
        integer content_key_version FK
        varchar client_message_id   "idempotency key клиента"
        bigint  server_order        "глобальный порядок"
        uuid    reply_to_message_id FK
        uuid    forwarded_from_sender_id FK "(V7)"
        timestamptz forwarded_at        "(V7)"
        timestamptz edited_at
        timestamptz created_at
    }

    chat_message_keys {
        uuid    id           PK
        uuid    chat_id      FK
        integer key_version
        bytea   encrypted_dek "зашифрованный DEK"
        varchar key_provider
        varchar key_reference
    }

    chat_message_links {
        uuid    id             PK
        uuid    chat_id        FK
        uuid    message_id     FK
        varchar url
        integer position_index
    }

    chat_pinned_messages {
        uuid        id         PK
        uuid        chat_id    FK
        uuid        message_id FK
        timestamptz pinned_at
    }

    chat_rooms    ||--o{ chat_messages       : "содержит"
    app_users     ||--o{ chat_messages       : "отправляет"
    chat_messages }o--o| chat_messages       : "ответ на (reply_to)"
    app_users     }o--o{ chat_messages       : "пересланные от (forwarded_from)"
    chat_rooms    ||--o{ chat_message_keys   : "версии ключей шифрования"
    chat_rooms    ||--o{ chat_message_links  : "ссылки из сообщений"
    chat_messages ||--o{ chat_message_links  : "содержит ссылки"
    chat_rooms    ||--o{ chat_pinned_messages : "закреплённые сообщения"
    chat_messages ||--o{ chat_pinned_messages : "закреплено в чате"

    %% ── Receipts & reactions ─────────────────────────────────────

    message_receipts {
        uuid        id           PK
        uuid        message_id   FK
        uuid        user_id      FK
        timestamptz delivered_at
        timestamptz read_at
    }

    message_reactions {
        uuid        id           PK
        uuid        message_id   FK
        uuid        user_id      FK
        varchar     reaction_key "код эмодзи/реакции"
        timestamptz created_at
    }

    user_chat_reaction_attentions {
        uuid        id         PK
        uuid        user_id    FK
        uuid        chat_id    FK
        timestamptz updated_at "время последней новой реакции"
    }

    chat_messages ||--o{ message_receipts             : "статусы доставки/прочтения"
    app_users     ||--o{ message_receipts             : "получатель"
    chat_messages ||--o{ message_reactions            : "реакции"
    app_users     ||--o{ message_reactions            : "ставит реакцию"
    app_users     ||--o{ user_chat_reaction_attentions : "внимание к реакциям"
    chat_rooms    ||--o{ user_chat_reaction_attentions : "в чате"

    %% ── Outbox & pending ─────────────────────────────────────────

    message_dispatch_outbox {
        uuid    id                PK
        uuid    chat_id
        uuid    message_id        FK
        varchar client_message_id
        varchar dispatch_mode     "FULL | ACK_ONLY"
        integer attempt_count
        timestamptz available_at
        timestamptz processed_at  "null = ещё не обработано"
    }

    user_pending_outgoing_messages {
        uuid    id                       PK
        uuid    user_id                  FK
        uuid    chat_id                  FK
        varchar client_message_id
        text    content
        varchar status                   "SENDING | FAILED"
        uuid    forwarded_from_message_id "(V8)"
        timestamptz created_at
        timestamptz updated_at
    }

    chat_messages ||--o{ message_dispatch_outbox         : "очередь доставки"
    app_users     ||--o{ user_pending_outgoing_messages  : "исходящие сообщения"
    chat_rooms    ||--o{ user_pending_outgoing_messages  : "в чат"

    %% ── User state ───────────────────────────────────────────────

    user_deleted_messages {
        uuid        id         PK
        uuid        user_id    FK
        uuid        message_id FK
        timestamptz deleted_at
    }

    user_contacts {
        uuid        id              PK
        uuid        user_id         FK
        uuid        contact_user_id FK
        timestamptz created_at
    }

    user_archived_chats {
        uuid        id          PK
        uuid        user_id     FK
        uuid        chat_id     FK
        timestamptz archived_at
    }

    user_deleted_chats {
        uuid        id         PK
        uuid        user_id    FK
        uuid        chat_id    FK
        timestamptz deleted_at
    }

    user_chat_drafts {
        uuid        id         PK
        uuid        user_id    FK
        uuid        chat_id    FK
        text        content
        timestamptz updated_at
    }

    user_blocks {
        uuid        id              PK
        uuid        user_id         FK
        uuid        blocked_user_id FK
        timestamptz created_at
    }

    app_users     ||--o{ user_deleted_messages : "удалил у себя"
    chat_messages ||--o{ user_deleted_messages : "удалено пользователем"
    app_users     ||--o{ user_contacts         : "контакты"
    app_users     ||--o{ user_archived_chats   : "архивирует"
    chat_rooms    ||--o{ user_archived_chats   : "архивирован"
    app_users     ||--o{ user_deleted_chats    : "удаляет чат"
    chat_rooms    ||--o{ user_deleted_chats    : "удалён пользователем"
    app_users     ||--o{ user_chat_drafts      : "черновики"
    chat_rooms    ||--o{ user_chat_drafts      : "черновик в чате"
    app_users     ||--o{ user_blocks           : "блокирует"

    %% ── Moderation ───────────────────────────────────────────────

    chat_room_bans {
        uuid        id                 PK
        uuid        chat_id            FK
        uuid        user_id            FK
        uuid        created_by_user_id FK
        timestamptz created_at
    }

    chat_room_moderators {
        uuid        id                 PK
        uuid        chat_id            FK
        uuid        user_id            FK
        uuid        created_by_user_id FK
        timestamptz created_at
    }

    chat_rooms ||--o{ chat_room_bans       : "баны"
    app_users  ||--o{ chat_room_bans       : "забанен"
    chat_rooms ||--o{ chat_room_moderators : "модераторы"
    app_users  ||--o{ chat_room_moderators : "является модератором"

    %% ── Invites ──────────────────────────────────────────────────

    invite_links {
        uuid    id          PK
        varchar code        "уникальный код ссылки"
        varchar target_type "GROUP | CONFERENCE"
        uuid    target_id   "id чата или конференции"
        timestamptz created_at
    }

    %% ── Video conferences ────────────────────────────────────────

    video_conferences {
        uuid        id                 PK
        varchar     title
        varchar     room_name          "Jitsi room"
        uuid        chat_id            FK "(V2)"
        uuid        created_by_user_id FK
        timestamptz scheduled_at
        timestamptz activated_at
        timestamptz started_at
        timestamptz ended_at
    }

    video_conference_participants {
        uuid        id            PK
        uuid        conference_id FK
        uuid        user_id       FK
        timestamptz invited_at
    }

    video_conference_attendance {
        uuid        id            PK
        uuid        conference_id FK
        uuid        user_id       FK
        uuid        session_id    FK
        timestamptz joined_at
        timestamptz last_seen_at
        timestamptz left_at
    }

    conference_recordings {
        uuid    conference_id       PK FK
        varchar stored_filename
        varchar mime_type
        bigint  size_bytes
        uuid    uploaded_by_user_id FK
        timestamptz created_at
    }

    chat_rooms             ||--o{ video_conferences              : "конференция чата"
    app_users              ||--o{ video_conferences              : "создаёт"
    video_conferences      ||--o{ video_conference_participants  : "приглашённые"
    app_users              ||--o{ video_conference_participants  : "приглашён"
    video_conferences      ||--o{ video_conference_attendance    : "история присутствия"
    app_users              ||--o{ video_conference_attendance    : "присутствовал"
    user_sessions          ||--o{ video_conference_attendance    : "через сессию"
    video_conferences      ||--o| conference_recordings          : "запись (0 или 1)"
    app_users              ||--o{ conference_recordings          : "загрузил"

    %% ── Attachments ──────────────────────────────────────────────

    chat_attachments {
        uuid    id           PK
        uuid    chat_id      FK
        uuid    message_id   FK "null до отправки сообщения"
        uuid    uploader_id  FK
        varchar storage_key  "ключ в S3/MinIO"
        varchar file_name
        varchar mime_type
        bigint  size_bytes
        timestamptz created_at
    }

    chat_rooms    ||--o{ chat_attachments : "файлы чата"
    chat_messages }o--o{ chat_attachments : "прикреплён к сообщению"
    app_users     ||--o{ chat_attachments : "загружает"

    %% ── Push subscriptions ───────────────────────────────────────

    user_push_subscriptions {
        uuid    id         PK
        uuid    user_id    FK
        varchar endpoint   "Web Push endpoint URL"
        varchar p256dh     "ключ шифрования"
        varchar auth       "auth secret"
        timestamptz expiration_time
        timestamptz updated_at
    }

    app_users ||--o{ user_push_subscriptions : "push-подписки"

    %% ── Mail ─────────────────────────────────────────────────────

    user_mailboxes {
        uuid    id         PK
        uuid    user_id    FK
        varchar email      "адрес почтового ящика"
        timestamptz created_at
    }

    app_users ||--o{ user_mailboxes : "почтовые ящики (V4)"

    %% ── Auth tokens ──────────────────────────────────────────────

    password_reset_tokens {
        uuid    id         PK
        uuid    user_id    FK
        varchar token_hash
        timestamptz expires_at
        timestamptz used_at
    }

    email_verification_tokens {
        uuid    id         PK
        uuid    user_id    FK
        varchar token_hash
        timestamptz expires_at
        timestamptz used_at
    }

    email_change_tokens {
        uuid    id            PK
        uuid    user_id       FK
        varchar pending_email "новый e-mail до подтверждения"
        varchar token_hash
        timestamptz expires_at
        timestamptz used_at
    }

    app_users ||--o{ password_reset_tokens      : "сброс пароля"
    app_users ||--o{ email_verification_tokens  : "верификация e-mail"
    app_users ||--o{ email_change_tokens        : "смена e-mail (V9)"
```

---

## Описание связей

### Пользователи и сессии
| Таблица | Связь | Описание |
|---|---|---|
| `app_users` → `user_sessions` | 1:N | У пользователя много активных сессий (разные устройства) |
| `app_users` → `user_push_subscriptions` | 1:N | Web/Android push-подписки |
| `app_users` → `user_mailboxes` | 1:N | Привязанные почтовые ящики |
| `app_users` → `*_tokens` | 1:N | Токены сброса пароля, верификации и смены e-mail |

### Чаты и участники
| Таблица | Связь | Описание |
|---|---|---|
| `chat_rooms` → `chat_participants` | 1:N | Участники чата; `left_at IS NULL` = активный |
| `chat_rooms.is_direct` | — | `true` = личный чат между двумя пользователями; уникальная пара `(direct_user_low_id, direct_user_high_id)` гарантирует единственность |
| `chat_rooms.prejoin_history_policy` | — | `FULL_HISTORY` — новый участник видит всю историю; `JOIN_ONLY` — только с момента вступления |

### Сообщения
| Таблица | Связь | Описание |
|---|---|---|
| `chat_messages` → `chat_messages` (reply_to) | N:1 | Цепочка ответов |
| `chat_messages.forwarded_from_sender_id` | N:1 | Пересланные сообщения |
| `chat_message_keys` | N:1 к `chat_rooms` | Ключи шифрования по версиям; сообщение ссылается на версию ключа |
| `chat_message_links` | N:1 к `chat_messages` | URL-превью ссылок внутри сообщения |
| `chat_pinned_messages` | N:N `chat_rooms` ↔ `chat_messages` | Закреплённые сообщения (несколько на чат) |

### Доставка
| Таблица | Связь | Описание |
|---|---|---|
| `message_receipts` | N:1 к `chat_messages` | `delivered_at` / `read_at` для каждого участника |
| `message_dispatch_outbox` | N:1 к `chat_messages` | Транзакционный outbox; обрабатывается асинхронно после коммита |
| `user_pending_outgoing_messages` | N:1 к `app_users` | Сообщения в статусе `SENDING`/`FAILED` на стороне клиента |

### Конференции
| Таблица | Связь | Описание |
|---|---|---|
| `video_conferences` → `chat_rooms` | N:1 | Конференция привязана к чату (V2) |
| `video_conference_participants` | N:1 к `video_conferences` | Приглашённые участники |
| `video_conference_attendance` | N:1 к `video_conferences` | Фактические подключения; `session_id` — конкретная сессия устройства |
| `conference_recordings` | 1:1 к `video_conferences` | Одна запись на конференцию |

### Вложения
| Таблица | Связь | Описание |
|---|---|---|
| `chat_attachments.message_id` | N:1, nullable | `NULL` пока сообщение не отправлено; после отправки привязывается |

### Пользовательские состояния
Все таблицы вида `user_*_chats`, `user_*_messages`, `user_contacts`, `user_blocks`, `user_chat_drafts` хранят **персональные** настройки — не видны другим пользователям.
