# Права доступа к базе данных

## Пользователи БД

| Пользователь | Тип | Назначение |
|---|---|---|
| `messenger` | Суперпользователь приложения | Основной пользователь: полный доступ ко всем таблицам, выполняет Flyway-миграции |
| `tester` | Read-only | QA-доступ: только `SELECT`, без возможности изменять данные |

---

## Пользователь `messenger` (приложение)

Создаётся при инициализации контейнера PostgreSQL через переменные окружения:

```
POSTGRES_USER=messenger
POSTGRES_DB=messenger
POSTGRES_PASSWORD=<из .env.prod>
```

Имеет полные права на базу `messenger`:
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` на все таблицы
- `USAGE`, `SELECT`, `NEXTVAL` на все sequences
- Выполняет Flyway-миграции (DDL: `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX` и т.д.)

**Доступ извне контейнера:** только через внутреннюю Docker-сеть (сервис `backend`). Напрямую с хоста не доступен без SSH-туннеля.

---

## Пользователь `tester` (QA)

### Права

```sql
GRANT CONNECT ON DATABASE messenger TO tester;
GRANT USAGE ON SCHEMA public TO tester;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tester;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO tester;
```

Распространяется на все существующие и **будущие** таблицы:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO tester;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO tester;
```

### Что разрешено

| Операция | Разрешена |
|---|---|
| `SELECT` на любую таблицу | ✅ |
| `SELECT` на любую sequence | ✅ |
| `INSERT` / `UPDATE` / `DELETE` | ❌ |
| `CREATE` / `DROP` / `ALTER` | ❌ |
| Подключение к другим базам | ❌ |
| Создание новых объектов | ❌ |

### Доступ по таблицам

Пользователь `tester` имеет `SELECT` на все 32 таблицы схемы `public`:

| Группа | Таблицы |
|---|---|
| Пользователи | `app_users`, `user_sessions` |
| Чаты | `chat_rooms`, `chat_participants` |
| Сообщения | `chat_messages`, `chat_message_keys`, `chat_message_links`, `chat_pinned_messages` |
| Доставка | `message_receipts`, `message_reactions`, `user_chat_reaction_attentions`, `message_dispatch_outbox` |
| Исходящие | `user_pending_outgoing_messages` |
| Пользовательское состояние | `user_deleted_messages`, `user_contacts`, `user_archived_chats`, `user_deleted_chats`, `user_chat_drafts`, `user_blocks` |
| Модерация | `chat_room_bans`, `chat_room_moderators` |
| Приглашения | `invite_links` |
| Конференции | `video_conferences`, `video_conference_participants`, `video_conference_attendance`, `conference_recordings` |
| Вложения | `chat_attachments` |
| Push | `user_push_subscriptions` |
| Почта | `user_mailboxes` |
| Токены | `password_reset_tokens`, `email_verification_tokens`, `email_change_tokens` |

> **Важно:** таблицы `password_reset_tokens`, `email_verification_tokens`, `email_change_tokens`, `user_sessions` содержат `token_hash` (SHA-256 от реального токена). Исходный токен в БД не хранится — только хэш. Таблица `chat_messages` содержит зашифрованный контент (`content_ciphertext`); расшифровать без мастер-ключа приложения невозможно.

---

## Подключение (только через SSH-туннель)

PostgreSQL привязан к `127.0.0.1:5432` на сервере — публично не доступен.

### Шаг 1 — открыть SSH-туннель

```bash
ssh -L 5432:127.0.0.1:5432 deploy@<IP_сервера> -p <SSH_PORT> -N
```

Туннель пробрасывает порт 5432 сервера на локальный `127.0.0.1:5432`.  
Оставьте команду работать в фоне (или добавьте флаг `-f`).

### Шаг 2 — подключиться в pgAdmin / DBeaver

| Параметр | Значение |
|---|---|
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `messenger` |
| Username | `tester` |
| Password | *(выдаётся отдельно)* |
| SSL | выключен (соединение внутри туннеля) |

### Подключение через psql

```bash
psql -h 127.0.0.1 -p 5432 -U tester -d messenger
```

---

## Создание пользователя `tester` на сервере

Скрипт: [deploy/setup-tester-db-access.sh](../deploy/setup-tester-db-access.sh)

```bash
PROD_SSH_HOST=<IP> \
PROD_SSH_USER=deploy \
TESTER_DB_PASSWORD=<пароль> \
bash deploy/setup-tester-db-access.sh
```

Скрипт:
1. Загружает [deploy/create-tester-db-user.sql](../deploy/create-tester-db-user.sql) на сервер
2. Выполняет его внутри контейнера: `docker exec -i messenger-postgres psql -U messenger -d messenger`
3. Удаляет временный файл с сервера

Если пользователь `tester` уже существует — скрипт обновит только пароль, права не затронет.

---

## Проверка прав в psql

```sql
-- Текущий пользователь и его роли
\conninfo
SELECT current_user, session_user;

-- Права на таблицы
SELECT table_name,
       privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'tester'
ORDER BY table_name;

-- Убедиться, что запись недоступна
INSERT INTO app_users (id) VALUES (gen_random_uuid());
-- ERROR: permission denied for table app_users
```
