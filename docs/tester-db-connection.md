# Подключение тестировщика к базе данных

## Что нужно заранее

- SSH-клиент (встроен в Windows 10+, macOS, Linux)
- [DBeaver Community](https://dbeaver.io/download/) **или** [pgAdmin 4](https://www.pgadmin.org/download/)
- Данные для подключения (получить у разработчика):
  - IP-адрес сервера
  - SSH-порт (обычно 22)
  - SSH-логин и ключ / пароль
  - Пароль пользователя `tester`

---

## Шаг 1 — SSH-туннель

База данных не открыта в интернет. Нужно пробросить порт через SSH.

Открой **терминал** (cmd, PowerShell, Terminal) и выполни:

```
ssh -L 5432:127.0.0.1:5432 deploy@<IP_СЕРВЕРА> -p <SSH_ПОРТ> -N
```

Пример:
```
ssh -L 5432:127.0.0.1:5432 deploy@185.123.45.67 -p 22 -N
```

- Команда не выводит ничего — это нормально, туннель работает.
- **Не закрывай** это окно терминала, пока работаешь с базой.
- Если SSH использует ключ: добавь `-i путь/к/ключу.pem`

---

## Шаг 2 — Подключение в DBeaver

1. Нажми **New Database Connection** (иконка розетки или `Ctrl+Shift+N`)
2. Выбери **PostgreSQL** → Next
3. Заполни поля:

| Поле | Значение |
|---|---|
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `messenger` |
| Username | `tester` |
| Password | *(пароль от tester)* |

4. Нажми **Test Connection** — должно появиться «Connected»
5. Нажми **Finish**

---

## Шаг 2 (альтернатива) — Подключение в pgAdmin 4

1. В левой панели: **Servers → Register → Server…**
2. Вкладка **General** → Name: `Messenger Production`
3. Вкладка **Connection**:

| Поле | Значение |
|---|---|
| Host name/address | `127.0.0.1` |
| Port | `5432` |
| Maintenance database | `messenger` |
| Username | `tester` |
| Password | *(пароль от tester)* |

4. Нажми **Save** — сервер появится в дереве

---

## Что доступно

Пользователь `tester` имеет **только `SELECT`** — данные можно читать, но не изменять.

Доступны все таблицы базы `messenger`. Основные:

| Таблица | Содержимое |
|---|---|
| `app_users` | Пользователи (без паролей в открытом виде) |
| `user_sessions` | Активные сессии |
| `chat_rooms` | Чаты (личные и групповые) |
| `chat_participants` | Участники чатов |
| `chat_messages` | Сообщения (контент зашифрован) |
| `message_receipts` | Статусы доставки и прочтения |
| `message_reactions` | Реакции на сообщения |
| `video_conferences` | Конференции |
| `chat_attachments` | Загруженные файлы |

Полная структура всех таблиц — в файле [schema.sql](schema.sql).  
ER-диаграмма со связями — в файле [schema-er.md](schema-er.md).

---

## Проверка подключения через psql (опционально)

```
psql -h 127.0.0.1 -p 5432 -U tester -d messenger
```

Проверочные запросы:

```sql
-- Список пользователей
SELECT username, display_name, created_at FROM app_users;

-- Активные чаты
SELECT title, is_direct, created_at FROM chat_rooms ORDER BY created_at DESC LIMIT 10;

-- Последние сообщения (контент зашифрован)
SELECT m.id, u.display_name AS sender, m.created_at
FROM chat_messages m
JOIN app_users u ON u.id = m.sender_id
ORDER BY m.server_order DESC
LIMIT 20;
```

---

## Частые вопросы

**Ошибка `Connection refused` на порту 5432**  
→ SSH-туннель не запущен или закрыт. Повтори Шаг 1.

**Ошибка `password authentication failed for user "tester"`**  
→ Неверный пароль. Уточни у разработчика.

**Ошибка `permission denied for table ...`**  
→ Пользователь `tester` имеет только `SELECT`. Операции записи недоступны — это ожидаемо.

**DBeaver просит скачать драйвер**  
→ Нажми **Download** — DBeaver сам скачает PostgreSQL JDBC-драйвер.
