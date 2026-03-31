# Messenger App

`Messenger App` — это MVP realtime-мессенджера с `Spring Boot` backend, `React + TypeScript` web-клиентом и запуском через `Docker Compose`.

Проект собран как модульный монолит:

- `backend` отвечает за аутентификацию, сессии, профили, контакты, чаты, группы, видеоконференции, сообщения и realtime
- `web` даёт Telegram-подобный интерфейс для общения и управления чатами
- `postgres` — основной источник истины для пользователей, сессий, чатов и сообщений
- `redis` вынесен в отдельный профиль и пока остается заделом под дальнейшее развитие presence и fan-out

## Что уже работает

### Backend

- регистрация и вход по username/password
- серверная политика сложности пароля и запрет слабых/часто используемых паролей
- JWT access token
- rotatable refresh token в `HttpOnly` cookie
- хранение пользовательских сессий с привязкой к устройству
- получение списка активных устройств и отзыв отдельных сессий
- профиль текущего пользователя
- изменение `displayName`
- изменение аватара
- поиск пользователей по `username` или `displayName`
- контакты на сервере
- создание личных чатов
- создание групповых чатов
- добавление участников в существующую группу
- планирование видеоконференций
- хранение списка участников видеоконференции
- архив чатов на сервере
- черновики на сервере
- unread counters на сервере
- загрузка истории сообщений с пагинацией
- отправка сообщений
- delivered/read receipts
- typing state по чатам
- realtime-обновления через `WebSocket/STOMP` для чатов, сообщений, статусов сообщений и событий сессий
- online-флаг пользователя на основе недавней активности сессии

### Frontend

- Telegram-подобный layout: список чатов слева, активный диалог справа
- изменение ширины списка диалогов
- поиск пользователей из верхней строки поиска
- вкладки `Диалоги`, `Группы` и `Видеоконференции`
- группы отображаются в левой панели сразу после создания
- личные чаты появляются в левой панели после первого сообщения
- список видеоконференций и экран планирования из бокового меню
- профиль с редактированием имени
- вставка аватара из буфера обмена в профиле
- экран архива
- экран контактов и добавление контактов из поиска
- создание групп из контактов
- добавление людей в группу из списка контактов
- экран активных устройств
- индикатор online/offline в личных диалогах
- unread counters, черновики и live-обновление списка чатов
- delivered/read-галочки у сообщений
- typing indicators
- встроенный Jitsi iframe для видеоконференций
- восстановление сессии через refresh cookie без хранения секретов в `localStorage`

### Важные замечания по текущей реализации

- refresh token не хранится в `localStorage`: он живет в `HttpOnly` cookie
- access token хранится только в памяти клиента
- Redis не стартует по умолчанию в dev-compose и пока не участвует в основном message flow
- realtime работает на встроенном Spring STOMP broker
- typing state сейчас краткоживущий и хранится в памяти backend-процесса

## Что пока не реализовано

- вложения и медиа
- push-уведомления
- реакции на сообщения
- reply / forward
- edit / delete сообщений
- end-to-end encryption
- полноценный distributed presence / last seen
- отдельный broker или gateway для realtime scale-out

## Технологии

### Backend

- `Java 17`
- `Spring Boot 3.5.7`
- `Spring Web`
- `Spring Security`
- `Spring Validation`
- `Spring Data JPA`
- `Spring WebSocket`
- `Spring Actuator`
- `Flyway`
- `PostgreSQL`
- `JJWT`
- `Maven`
- тесты: `JUnit 5`, `Spring Boot Test`, `Spring Security Test`

### Frontend

- `React 19`
- `TypeScript 5`
- `Vite 7`
- `@vitejs/plugin-react-swc`
- `TanStack Query`
- `SockJS`
- `STOMP.js`
- тесты: `Vitest`, `JSDOM`

### Infra

- `Docker Compose`
- `PostgreSQL 17`
- `Redis 7` в optional profile
- `nginx`

## Архитектура

### Backend-модули

- `api` — REST-контроллеры и DTO
- `application.auth` — регистрация, логин, refresh flow, сессии, профиль, контакты, password policy
- `application.chat` — список чатов, архив, черновики, direct/group chats, участники, unread counters и видеоконференции
- `application.message` — история сообщений, отправка, delivered/read receipts, typing state
- `domain` — сущности и репозитории
- `security` — JWT auth для HTTP и WebSocket, refresh-cookie configuration
- `config` — CORS, WebSocket/STOMP, обработка ошибок

### Основные точки входа

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `PUT /api/auth/me/avatar`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/{sessionId}`
- `GET /api/users/search`
- `GET /api/users/contacts`
- `POST /api/users/contacts`
- `DELETE /api/users/contacts/{username}`
- `GET /api/chats`
- `GET /api/chats/archive`
- `GET /api/chats/drafts`
- `POST /api/chats/direct`
- `POST /api/chats/group`
- `POST /api/chats/{chatId}/participants`
- `PUT /api/chats/{chatId}/archive`
- `PUT /api/chats/{chatId}/draft`
- `GET /api/chats/{chatId}/messages`
- `POST /api/chats/{chatId}/messages`
- `POST /api/chats/{chatId}/messages/delivered`
- `POST /api/chats/{chatId}/messages/read`
- `GET /api/chats/{chatId}/typing`
- `POST /api/chats/{chatId}/typing`
- `GET /api/conferences`
- `POST /api/conferences`
- `WebSocket endpoint: /ws`

## Быстрый старт через Docker

### Требования

- `Docker Desktop`

### Запуск dev-контура

```bash
docker compose up --build
```

Что делает этот режим:

- backend стартует в `dev`-профиле
- если `APP_JWT_SECRET` не задан, backend сам генерирует временный signing secret
- после рестарта backend все текущие сессии станут недействительными

Если нужен и Redis:

```bash
docker compose --profile redis up --build
```

### Автономная server-side запись видеоконференций

Для `Jibri` запускай отдельный recording-профиль:

```bash
docker compose --profile autonomous-recording up --build
```

Важно:

- `Jibri` требует Linux host c loopback audio, поэтому на обычном Docker Desktop для Windows этот режим не считается полноценным
- backend автоматически импортирует готовые файлы из общего volume после завершения встречи
- organizer больше не загружает видео из браузера: запись идет через server-side file recording

### Что будет доступно

- web: `http://localhost:3000`
- backend API: `http://localhost:8080`
- healthcheck backend: `http://localhost:8080/actuator/health`

### Остановка

```bash
docker compose down
```

### Сброс данных контейнеров

```bash
docker compose down -v
```

## Локальный запуск без Docker для backend и web

Этот режим удобен, если инфраструктуру хочется держать в контейнерах, а backend и frontend запускать локально.

### Требования

- `Java 17+`
- `Maven 3.9+`
- актуальная LTS-версия `Node.js`
- `Docker Desktop`

### Поднять только инфраструктуру

```bash
docker compose up -d postgres
```

Если нужен Redis:

```bash
docker compose --profile redis up -d redis
```

### Запустить backend

Если `APP_JWT_SECRET` не задан, запускай backend в `dev`-профиле:

```bash
cd backend
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
```

Если хочешь, чтобы локальные сессии переживали рестарт backend, задай постоянный `APP_JWT_SECRET`.

### Запустить frontend

```bash
cd web
npm install
npm run dev
```

### Адреса в локальном режиме

- backend: `http://localhost:8080`
- frontend dev server: `http://localhost:5173`

## Запуск для клиентов

Для клиентского контура используй постоянный JWT secret и `prod`-профиль backend.

1. Скопируй `.env.prod.example` в `.env.prod`
2. Заполни `POSTGRES_PASSWORD`, `DB_PASSWORD`, `APP_CORS_ALLOWED_ORIGINS` и `APP_JWT_SECRET`
3. Запусти:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Для autonomous recording в prod добавь recording-профиль:

```bash
docker compose --profile autonomous-recording --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Важно:

- в `prod` нет автогенерации JWT secret
- `APP_JWT_SECRET` должен быть корректным Base64-ключом длиной не меньше 32 байт после декодирования
- `APP_AUTH_REFRESH_COOKIE_SECURE=true` включен в prod-профиле

## Переменные окружения

Базовые значения лежат в [.env.example](.env.example), а пример для client/prod-контура — в [.env.prod.example](.env.prod.example).

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `SERVER_PORT` | HTTP-порт backend | `8080` |
| `DB_URL` | JDBC URL PostgreSQL | `jdbc:postgresql://localhost:5432/messenger` |
| `DB_USERNAME` | пользователь PostgreSQL | `messenger` |
| `DB_PASSWORD` | пароль PostgreSQL | `messenger` |
| `APP_CORS_ALLOWED_ORIGINS` | разрешенные origins для backend | `http://localhost:5173` |
| `APP_JWT_SECRET` | секрет подписи JWT | пусто в dev по умолчанию; обязателен для стабильного локального запуска и для prod |
| `APP_JWT_REFRESH_TOKEN_TTL` | TTL refresh token | `P30D` |
| `APP_AUTH_REFRESH_COOKIE_NAME` | имя refresh cookie | `north_refresh_token` |
| `APP_AUTH_REFRESH_COOKIE_PATH` | path refresh cookie | `/api/auth` |
| `APP_AUTH_REFRESH_COOKIE_SAME_SITE` | SameSite для refresh cookie | `Lax` |
| `APP_AUTH_REFRESH_COOKIE_SECURE` | флаг Secure для refresh cookie | `false` |
| `VITE_API_URL` | базовый URL backend API | `http://localhost:8080` |
| `VITE_WS_URL` | базовый URL для websocket | `http://localhost:8080` |
| `VITE_JITSI_BASE_URL` | базовый URL Jitsi для видеоконференций | `https://meet.jit.si` |

## Ручная проверка

Базовый сценарий:

1. Открой `http://localhost:3000`
2. Зарегистрируй `user1`
3. Открой второе окно браузера или режим инкогнито
4. Зарегистрируй `user2`
5. Найди `user2` через поиск сверху и открой личный чат
6. Отправь первое сообщение и проверь, что диалог появился в списке слева
7. Проверь delivered/read-галочки
8. Начни печатать в одном клиенте и проверь typing indicator во втором
9. Добавь `user2` в контакты
10. Создай группу из контактов
11. Создай черновик, обнови страницу и проверь, что он сохранился
12. Открой вкладку видеоконференций, запланируй встречу и проверь, что открылся встроенный Jitsi room
13. Архивируй чат, обнови страницу и проверь, что архив сохранился
13. Открой экран активных устройств и проверь, что отображается текущее устройство

## Текущие ограничения

- online-статус основан на недавней активности сессии, а не на полноценной presence-системе
- typing state хранится в памяти backend-процесса и не рассчитан на несколько инстансов
- используется встроенный in-process STOMP broker
- Redis пока не включен в основной backend flow
- в проекте нет вложений, реакций, reply/forward, edit/delete и push-уведомлений

## Куда развивать дальше

- вложения через object storage
- reply / forward / edit / delete
- реакции на сообщения
- last seen и полноценный presence-service
- Redis-backed fan-out или отдельный broker/gateway для realtime
- e2e и integration tests на сценарии с двумя клиентами
