# Messenger App

Production-ready self-hosted messenger with:

- Spring Boot 3 backend (Java 17)
- React 19 + TypeScript + Vite web client
- React Native Android client
- Shared TypeScript contracts package (`@north/shared`)
- PostgreSQL primary datastore
- WebSocket/STOMP realtime delivery
- Optional Redis fan-out for multi-instance delivery
- Optional Jitsi video conferencing (local or external)
- MinIO object storage for file attachments
- Docker Compose for local and production deployment

## Messaging model

The project uses a **server-trusted** messaging model.

- Clients send `PlainMessagePayload`.
- The server validates, stores, encrypts at rest, and broadcasts content.
- Security is based on TLS, authentication, authorization, and server-side operational controls.

This project must not be described as E2EE.

## Features

- Registration, login, refresh tokens, active sessions, password change, password reset, email verification
- Direct chats and group chats with join-only and full-history prejoin policies
- Send, edit, reply, forward, pin, reactions, delete-for-self, delete-for-everyone
- Unread counters, typing indicators, delivered/read receipts
- File attachments and image previews (stored in MinIO / S3-compatible)
- Contacts, user search, archive, drafts, blocking
- Group owners, moderators, bans, invite links
- Video conferences (Jitsi) with recording import and download
- Web Push notifications (VAPID) and FCM push for Android
- Optional observability stack (Prometheus, Grafana, Loki, Tempo, Alertmanager)
- Optional built-in mail server (Stalwart IMAP/SMTP, per-user mailboxes)
- Rate limiting on all mutating API endpoints
- Message content encrypted at rest (AES-256-GCM, local key or AWS KMS)

## Repository layout

| Directory | Contents |
|-----------|----------|
| `backend/` | Spring Boot 3 / Java 17 application |
| `web/` | React 19 + TypeScript + Vite SPA |
| `android-app/` | React Native Android client |
| `packages/shared/` | Shared TypeScript type contracts |
| `deploy/` | Production scripts, Caddy config, observability stack |
| `jitsi/` | Jitsi Meet configuration |
| `docs/` | Architecture and product notes |

## Local development

Requirements: Docker Desktop

```bash
docker compose up --build
```

With Redis (required for multi-replica backend):

```bash
docker compose --profile redis up --build
```

Local URLs:

| Service | URL |
|---------|-----|
| Web | `http://localhost:3000` |
| Backend | `http://localhost:8080` |
| Health | `http://localhost:8080/actuator/health` |
| Swagger | `http://localhost:8080/swagger-ui.html` |
| Mailpit | `http://localhost:8025` |
| Jitsi | `http://localhost:8090` |

Reset all local data:

```bash
docker compose down -v
```

## Backend + frontend without Docker

Requirements: Java 17+, Maven 3.9+, Node.js 22+

```bash
# Start only infrastructure
docker compose up -d postgres mailpit

# Backend
cd backend && mvn spring-boot:run

# Frontend
cd web && npm install && npm run dev
```

## Android app

Requirements: Node.js 22+, Android Studio, Android SDK

```bash
cd android-app
npm install
npm run typecheck
npm test -- --runInBand
npm start          # Metro bundler
npm run android    # build + run on emulator/device
```

Dev networking: Android emulator targets `http://10.0.2.2:8080` for the local backend.

## Tests

```bash
# Backend (259 tests)
cd backend && mvn test

# Single test class
cd backend && mvn test -Dtest=InviteLinkServiceTest

# Frontend
cd web && npm run typecheck
cd web && npm run test:run
cd web && npm run build

# Android
cd android-app && npm run typecheck
cd android-app && npm test -- --runInBand
cd android-app && npm run lint
```

## Production deployment

### Quick start

1. Clone to `/opt/messenger-app` on the server.
2. Bootstrap env defaults:
   ```bash
   PROD_PUBLIC_BASE_URL=https://your-domain.example bash deploy/bootstrap-prod-env.sh
   ```
3. Edit `.env.prod` — fill in all `CHANGE_ME` values.
4. Deploy:
   ```bash
   ./deploy/remote-update.sh
   ```

### Deploy via GitHub Actions

1. Create a `production` environment or repository secrets with:
   - `PROD_SSH_HOST` — server hostname or IP
   - `PROD_SSH_PORT` — SSH port (default 22)
   - `PROD_SSH_USER` — deploy user (e.g. `deploy`)
   - `PROD_APP_DIR` — checkout path (e.g. `/opt/messenger-app`)
   - `PROD_PUBLIC_BASE_URL` — e.g. `https://your-domain.example`
   - `PROD_SSH_PRIVATE_KEY` — SSH private key for deploy user
   - `PROD_SSH_KNOWN_HOSTS` — output of `ssh-keyscan -H your-server`
2. Go to **Actions → Deploy Production → Run workflow**.

### Deploy from workstation (Windows)

```powershell
Copy-Item .env.deploy-button.example .env.deploy-button
# Edit .env.deploy-button: set PROD_SSH_HOST and PROD_PUBLIC_BASE_URL
deploy\deploy-prod-button.cmd
```

### Environment configuration

Copy `.env.prod.example` to `.env.prod` and fill in secrets. The bootstrap script sets safe defaults for any missing values on first run.

#### Required secrets

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password |
| `DB_PASSWORD` | App DB password (same as above unless separate) |
| `APP_JWT_SECRET` | JWT signing secret — 32-byte base64, stable across replicas |
| `APP_REALTIME_REDIS_MAC_SECRET` | Redis channel integrity secret — 32-byte base64 |
| `MINIO_ROOT_PASSWORD` | MinIO root password |
| `APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_SECRET_KEY` | MinIO access secret (same as above by default) |

Generate secrets with:
```bash
openssl rand -base64 32
```

#### Core configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_DOMAIN` | — | Public domain name, e.g. `your-domain.example` |
| `APP_CORS_ALLOWED_ORIGINS` | — | Frontend origin, e.g. `https://your-domain.example` |
| `BACKEND_REPLICAS` | `1` | Number of backend instances |
| `WEB_REPLICAS` | `1` | Number of web instances |
| `APP_DB_MAX_POOL_SIZE` | `30` | HikariCP max connections per backend instance |
| `APP_REALTIME_REDIS_ENABLED` | `true` | Redis pub/sub for multi-replica delivery |

#### Resource limits (Docker)

All limits are tunable via env vars without editing `docker-compose.prod.yml`.

| Variable | Default | Service |
|----------|---------|---------|
| `CPUS_BACKEND` | `1.0` | Backend CPU limit |
| `MEM_LIMIT_BACKEND` | `1024m` | Backend memory limit |
| `CPUS_POSTGRES` | `0.75` | PostgreSQL CPU limit |
| `MEM_LIMIT_POSTGRES` | `320m` | PostgreSQL memory limit |
| `POSTGRES_SHARED_BUFFERS` | `96MB` | PostgreSQL shared_buffers |
| `POSTGRES_WORK_MEM` | `12MB` | PostgreSQL work_mem per query |
| `POSTGRES_EFFECTIVE_CACHE_SIZE` | `224MB` | PostgreSQL effective_cache_size |
| `MEM_LIMIT_REDIS` | `96m` | Redis memory limit |
| `REDIS_MAXMEMORY` | `80mb` | Redis maxmemory |
| `CPUS_STALWART` | `0.25` | Stalwart mail server CPU limit |
| `MEM_LIMIT_STALWART` | `256m` | Stalwart memory limit |
| `JAVA_TOOL_OPTIONS` | G1GC, 60% heap | Override full JVM flags |

Baseline for a **2 GB VPS with external Jitsi** (recommended):

```bash
ENABLE_LOCAL_JITSI=false
JITSI_PUBLIC_URL=https://your-jitsi-server.example
APP_MAIL_ENABLED=false
# Everything else uses the defaults above
```

Baseline for a **4 GB VPS with local Jitsi**:

```bash
ENABLE_LOCAL_JITSI=true
MEM_LIMIT_BACKEND=1536m
MEM_LIMIT_POSTGRES=512m
APP_DB_MAX_POOL_SIZE=50
```

#### JVM configuration

The backend defaults to G1GC with 60% of the container memory as max heap:

```
-XX:+UseG1GC -XX:MaxRAMPercentage=60 -XX:MaxMetaspaceSize=160m
```

Override the entire JVM configuration with `JAVA_TOOL_OPTIONS` in `.env.prod`.

#### Jitsi video conferencing

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_LOCAL_JITSI` | `false` | Start bundled Jitsi containers |
| `JITSI_PUBLIC_URL` | — | Public URL of the Jitsi instance |
| `JITSI_ADVERTISE_IPS` | auto | Public IP advertised by JVB (local Jitsi only) |

To use an **external Jitsi server** (saves ~260 MB RAM):

```bash
ENABLE_LOCAL_JITSI=false
JITSI_PUBLIC_URL=https://your-jitsi-server.example
```

To use the **bundled local Jitsi**:

```bash
ENABLE_LOCAL_JITSI=true
JITSI_PUBLIC_URL=https://your-domain.example/meet
JITSI_ADVERTISE_IPS=<your-server-public-ip>
JITSI_JICOFO_COMPONENT_SECRET=<random-token>
JITSI_JICOFO_AUTH_PASSWORD=<random-token>
JITSI_JVB_AUTH_PASSWORD=<random-token>
JITSI_JIBRI_RECORDER_PASSWORD=<random-token>
JITSI_JIBRI_XMPP_PASSWORD=<random-token>
```

#### Mail server (optional)

Built-in mail server (Stalwart) is disabled by default to save resources.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_MAIL_ENABLED` | `false` | Enable built-in Stalwart mail server |
| `APP_MAIL_DOMAIN` | `ktsf.ru` | Mail domain for user mailboxes |
| `STALWART_ADMIN_SECRET` | — | Stalwart admin API secret |
| `APP_MAIL_CREDENTIAL_SECRET` | — | Secret for encrypting IMAP/SMTP credentials |

When `APP_MAIL_ENABLED=false`, the Stalwart container does not start and the mail tab in the UI shows "почтовый сервер отключён".

#### Push notifications

Web Push (VAPID):

```bash
APP_PUSH_ENABLED=true
APP_PUSH_SUBJECT=mailto:no-reply@your-domain.example
APP_PUSH_VAPID_PUBLIC_KEY=<base64url P-256 public key>
APP_PUSH_VAPID_PRIVATE_KEY=<base64url P-256 private key>
```

FCM push for Android:

```bash
APP_PUSH_FCM_ENABLED=true
APP_PUSH_FCM_SERVICE_ACCOUNT_JSON=<Google service account JSON, single line>
```

#### Email (SMTP for verification and password reset)

```bash
SPRING_MAIL_HOST=smtp.your-provider.example
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=no-reply@your-domain.example
SPRING_MAIL_PASSWORD=<smtp-password>
APP_AUTH_EMAIL_VERIFICATION_ENABLED=true
APP_AUTH_EMAIL_VERIFICATION_URL_BASE=https://your-domain.example/
APP_AUTH_PASSWORD_RESET_ENABLED=true
APP_AUTH_PASSWORD_RESET_URL_BASE=https://your-domain.example/
```

#### Message encryption

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_MESSAGES_CONTENT_ENCRYPTION_PROVIDER` | `aws-kms` | `local` or `aws-kms` |
| `APP_MESSAGES_CONTENT_ENCRYPTION_LOCAL_MASTER_KEY_BASE64` | — | 32-byte base64 master key (local mode) |
| `APP_MESSAGES_CONTENT_ENCRYPTION_AWS_KMS_KEY_ID` | — | KMS key ID (aws-kms mode) |
| `APP_MESSAGES_CONTENT_ENCRYPTION_AWS_REGION` | `us-east-1` | AWS region |

For a self-hosted VPS without KMS, use `local` with a stable master key backed up separately:

```bash
APP_MESSAGES_CONTENT_ENCRYPTION_PROVIDER=local
APP_MESSAGES_CONTENT_ENCRYPTION_LOCAL_MASTER_KEY_BASE64=$(openssl rand -base64 32)
```

#### Object storage (MinIO / S3)

By default the bundled MinIO container is used. To use an external S3-compatible provider:

```bash
APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_ENDPOINT=https://s3.your-provider.example
APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_PATH_STYLE_ACCESS=false
APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_PUBLIC_ENDPOINT=https://your-bucket-public-url
APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_ACCESS_KEY=<access-key>
APP_MEDIA_MESSAGE_ATTACHMENTS_MINIO_SECRET_KEY=<secret-key>
```

#### Horizontal scaling

To run multiple backend replicas on a single host:

```bash
APP_REALTIME_REDIS_ENABLED=true
APP_AUTH_RATE_LIMIT_REDIS_ENABLED=true
APP_REALTIME_REDIS_MAC_SECRET=<stable-secret>
APP_JWT_SECRET=<stable-secret>
BACKEND_REPLICAS=2
```

PostgreSQL and Redis remain singletons in this topology.

#### Observability (optional)

Prometheus + Grafana + Loki + Tempo + Alertmanager stack:

```bash
ENABLE_OBSERVABILITY_STACK=true
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<password>
APP_ACTUATOR_SCRAPE_USERNAME=prometheus
APP_ACTUATOR_SCRAPE_PASSWORD=<password>
```

Accessible at `https://your-domain.example/observability/` after enabling.

#### DB viewer (optional)

```bash
ENABLE_DBVIEWER=true
PGWEB_AUTH_USER=tester
PGWEB_AUTH_PASS=<password>
```

### HTTP API documentation

- Swagger UI: `/swagger-ui.html`
- OpenAPI JSON: `/v3/api-docs`

Disable with `APP_OPENAPI_ENABLED=false`.

## Backups

The repository includes backup helpers covering PostgreSQL, MinIO, Caddy certificates, and `.env.prod`.

```bash
# Install systemd backup timer (runs daily)
bash deploy/install-backup-timer.sh

# Manual backup
bash deploy/backup.sh
```

See [`deploy/BACKUPS.md`](deploy/BACKUPS.md) for restore procedures.

## Production runbook

See [`deploy/PRODUCTION.md`](deploy/PRODUCTION.md) for:

- Server hardening and user setup
- Full deploy flow details
- Full reset procedure
- Push notification key generation
