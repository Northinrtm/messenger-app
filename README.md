# Messenger App

`Messenger App` — это MVP realtime-мессенджера с `Java` backend, `React` web-клиентом и запуском через Docker. Проект собран как модульный монолит: backend отвечает за auth, чаты, историю сообщений и realtime-доставку, а web-клиент дает интерфейс для регистрации, общения и управления диалогами.

## Что умеет

- регистрация и вход по JWT
- refresh tokens с ротацией и отзывом активных сессий
- direct chats один на один
- group chats с названием и несколькими участниками
- история сообщений по каждому чату
- постраничная догрузка ранней истории сообщений
- live-обновление чатов и сообщений без ручной перезагрузки страницы
- realtime через WebSocket/STOMP
- polling fallback на клиенте, если websocket временно недоступен
- хранение пользователей, чатов, участников и сообщений в PostgreSQL
- запуск всего стека одной командой через Docker Compose

## Что это не умеет

Сейчас это сильный MVP, а не полностью production-ready система. В проекте пока нет:

- вложений
- read receipts
- typing indicators
- push-уведомлений
- end-to-end encryption
- выделенного брокера для realtime

## Технологии

### Backend

- `Java 17`
- `Spring Boot 3`
- `Spring Web`
- `Spring Security`
- `Spring Data JPA`
- `Spring WebSocket`
- `Flyway`
- `PostgreSQL`
- `JWT (jjwt)`

### Frontend

- `React 19`
- `TypeScript`
- `Vite`
- `TanStack Query`
- `SockJS`
- `STOMP`

### Infra

- `Docker Compose`
- `nginx`
- `Redis`

## Архитектура

- `backend` отдает REST API для регистрации, логина, создания чатов, загрузки списка диалогов и истории сообщений
- `backend` рассылает новые события через WebSocket/STOMP
- `web` хранит access/refresh-сессию локально, автоматически обновляет access token и работает с API + realtime-каналом
- `postgres` — основное хранилище пользователей, чатов, участников и сообщений
- `redis` уже поднят в инфраструктуре как задел под presence, fan-out и дальнейшее масштабирование
- `nginx` в docker-сборке отдает web-клиент и проксирует API/WebSocket на backend

Подробнее: [docs/architecture.md](docs/architecture.md)

## Структура проекта

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

## Быстрый старт через Docker

### Требования

- Docker Desktop

### Запуск

```bash
docker compose up --build
```

Если Docker BuildKit в WSL падает на этапе `exporting to image` с ошибкой вида `parent snapshot ... does not exist`, это проблема локального Docker image store, а не приложения. Обычно помогает:

```bash
docker compose down --remove-orphans
docker builder prune -af
docker buildx prune -af
```

После этого перезапусти Docker Desktop и повтори сборку. Если ошибка остается, отключи в Docker Desktop опцию `Use containerd for pulling and storing images`.

### Что будет доступно

- web: `http://localhost:3000`
- backend API: `http://localhost:8080`
- healthcheck: `http://localhost:8080/actuator/health`

### Остановка

```bash
docker compose down
```

### Полный сброс данных

```bash
docker compose down -v
```

## Локальный запуск без Docker для backend и web

Этот режим удобен, если `postgres` и `redis` ты поднимаешь в контейнерах, а backend и frontend запускаешь локально.

### Требования

- `Java 17+`
- `Maven 3.9+`
- `Node.js 22+`
- Docker Desktop

### Поднять только инфраструктуру

```bash
docker compose up -d postgres redis
```

### Запустить backend

```bash
cd backend
mvn spring-boot:run
```

### Запустить web

```bash
cd web
npm install
npm run dev
```

В локальном режиме адреса будут такими:

- backend: `http://localhost:8080`
- web dev server: `http://localhost:5173`

## Ручная проверка

После запуска проверь базовый сценарий:

1. Открой `http://localhost:3000`
2. Зарегистрируй `user1`
3. Открой второе окно браузера в инкогнито
4. Зарегистрируй `user2`
5. От имени `user1` создай direct chat с `user2`
6. Отправь сообщение
7. Убедись, что у `user2` оно появилось без обновления страницы
8. Зарегистрируй `user3`
9. Создай group chat, например `team`, с участниками `user2, user3`
10. Отправь сообщение в группу и проверь, что оно появляется у всех участников без refresh

Healthcheck:

```bash
curl http://localhost:8080/actuator/health
```

Ожидаемый ответ:

```json
{"status":"UP"}
```

## Переменные окружения

Базовые значения лежат в [.env.example](.env.example).

Основные переменные:

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `SERVER_PORT` | HTTP-порт backend | `8080` |
| `DB_URL` | JDBC URL PostgreSQL | `jdbc:postgresql://localhost:5432/messenger` |
| `DB_USERNAME` | пользователь PostgreSQL | `messenger` |
| `DB_PASSWORD` | пароль PostgreSQL | `messenger` |
| `APP_CORS_ALLOWED_ORIGINS` | разрешенные origin для backend | `http://localhost:5173` |
| `APP_JWT_SECRET` | секрет подписи JWT | demo secret для локальной разработки |
| `APP_JWT_REFRESH_TOKEN_TTL` | TTL refresh token | `P30D` |
| `VITE_API_URL` | базовый URL backend API | `http://localhost:8080` |
| `VITE_WS_URL` | базовый URL для websocket | по умолчанию берется из `VITE_API_URL` |

## Полезные команды

Проверить контейнеры:

```bash
docker compose ps
```

Логи backend:

```bash
docker compose logs -f backend
```

Логи web:

```bash
docker compose logs -f web
```

Запустить backend-тесты:

```bash
cd backend
mvn test
```

Проверить типы во frontend:

```bash
cd web
npm run typecheck
```

Запустить frontend-тесты:

```bash
cd web
npm run test:run
```

Собрать frontend:

```bash
cd web
npm run build
```

## Текущие ограничения

- сообщения не шифруются end-to-end
- access token и refresh token хранятся на клиенте локально
- Redis пока не участвует в основном message flow
- используется встроенный in-process STOMP broker, а не отдельный realtime cluster

## Что можно развивать дальше

- read receipts и unread counters
- typing indicators и presence
- вложения через object storage
- observability, метрики и tracing
- вынос realtime в отдельный broker или gateway
- интеграционные тесты с Testcontainers и CI
