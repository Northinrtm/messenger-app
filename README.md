# Messenger App

Production-style MVP мессенджера с `Java` backend, `TypeScript` web-клиентом, realtime-доставкой сообщений и Docker-first процессом разработки.

## Что уже есть

- аутентификация на JWT
- direct chat один на один
- API для истории сообщений
- realtime-доставка через WebSocket/STOMP
- миграции PostgreSQL через Flyway
- запуск всего стека через Docker Compose

## Стек

- `backend`: Java 17, Spring Boot, Spring Security, Spring WebSocket, Spring Data JPA, Flyway
- `database`: PostgreSQL
- `cache / scale-out-ready`: Redis
- `web`: React 19, TypeScript, Vite, TanStack Query, SockJS + STOMP
- `ops`: Docker Compose, nginx reverse proxy

## Архитектура

- `backend` отдает REST API для auth, создания чатов и загрузки истории сообщений
- `backend` рассылает новые сообщения подписчикам чата через WebSocket/STOMP
- `web` в Docker работает через nginx и проксирует запросы в backend
- `postgres` хранит пользователей, чаты, участников и сообщения
- `redis` уже подключен как задел под presence, fan-out и дальнейшее масштабирование

Подробности по архитектуре: [docs/architecture.md](docs/architecture.md)

## Структура репозитория

```text
.
|-- backend/
|   |-- src/main/java/com/north/messenger/
|   |-- src/main/resources/
|   |-- src/test/java/
|   |-- Dockerfile
|   `-- pom.xml
|-- web/
|   |-- src/
|   |-- nginx/
|   |-- Dockerfile
|   `-- package.json
|-- docs/
|   `-- architecture.md
|-- docker-compose.yml
`-- README.md
```

## Быстрый старт

### Требования

- Docker Desktop

### Запуск всего стека

```bash
docker compose up --build
```

### Что откроется после старта

- web-приложение: `http://localhost:3000`
- backend API: `http://localhost:8080`
- healthcheck backend: `http://localhost:8080/actuator/health`

### Остановка

```bash
docker compose down
```

### Полный сброс БД и Redis volume

```bash
docker compose down -v
```

## Локальная разработка без Docker для backend и web

Этот режим нужен, если Docker используется только для инфраструктуры, а backend и web ты запускаешь локально.

### Требования

- Java 17+
- Maven 3.9+
- Node.js 22+
- Docker Desktop

### Поднять только инфраструктуру

```bash
docker compose up -d postgres redis
```

### Запуск backend

```bash
cd backend
mvn spring-boot:run
```

### Запуск web-клиента

```bash
cd web
npm install
npm run dev
```

В этом режиме адреса будут такими:

- backend: `http://localhost:8080`
- Vite dev server: `http://localhost:5173`

## Проверка работы

После запуска проверь полный сценарий:

1. Открой `http://localhost:3000`
2. Зарегистрируй `user1`
3. Открой второе окно браузера в режиме инкогнито
4. Зарегистрируй `user2`
5. В аккаунте `user1` создай direct chat по username `user2`
6. Отправь сообщение от `user1`
7. Ответь из `user2`
8. Убедись, что сообщения появляются без перезагрузки страницы

Проверка health endpoint:

```bash
curl http://localhost:8080/actuator/health
```

Ожидаемый ответ:

```json
{"status":"UP"}
```

## Переменные окружения

Базовые значения описаны в [.env.example](.env.example).

Основные переменные:

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `SERVER_PORT` | HTTP-порт backend | `8080` |
| `DB_URL` | JDBC-строка подключения к PostgreSQL | `jdbc:postgresql://localhost:5432/messenger` |
| `DB_USERNAME` | пользователь PostgreSQL | `messenger` |
| `DB_PASSWORD` | пароль PostgreSQL | `messenger` |
| `APP_CORS_ALLOWED_ORIGINS` | разрешенные web-origin для backend | `http://localhost:5173` |
| `APP_JWT_SECRET` | секрет для подписи JWT | локальный demo secret |
| `VITE_API_URL` | базовый URL API для web-клиента | `http://localhost:8080` в локальной разработке |
| `VITE_WS_URL` | базовый URL websocket-подключения | по умолчанию берется из `VITE_API_URL` |

## Полезные команды

Проверить контейнеры:

```bash
docker compose ps
```

Смотреть логи backend:

```bash
docker compose logs -f backend
```

Смотреть логи web:

```bash
docker compose logs -f web
```

Пересобрать только backend:

```bash
docker compose build --no-cache backend
```

## Текущий scope

Сейчас в репозитории реализован сильный MVP, а не полностью масштабированная production-система.

Уже включено:

- auth
- direct chats
- история сообщений
- realtime-доставка
- Dockerized local startup

Пока не реализовано:

- group chats
- read receipts
- typing indicators
- attachments
- push notifications
- refresh tokens и управление сессиями
- распределенный fan-out сообщений

## Дальнейшие шаги для production

- вынести in-process STOMP broker в отдельный broker или websocket gateway
- добавить refresh tokens с rotation и явным session revocation
- добавить read receipts и unread counters
- добавить typing indicators и presence через Redis
- добавить вложения через object storage
- добавить интеграционные тесты с Testcontainers и CI
- добавить observability, метрики и трассировку запросов
