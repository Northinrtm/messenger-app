# Messenger App

Production-style messenger MVP with a `Java` backend and a `TypeScript` web client.

## Stack

- `backend`: Java 17, Spring Boot, Spring Security, Spring WebSocket, JPA, Flyway
- `database`: PostgreSQL
- `cache/realtime-ready`: Redis
- `web`: React 19, TypeScript, Vite, TanStack Query, STOMP over SockJS
- `ops`: Docker Compose, environment-based configuration

## What is implemented

- registration and login with JWT access tokens
- direct chats between users
- message history API
- realtime message delivery over WebSocket/STOMP
- Flyway database migrations
- structured project layout and environment configuration

## Repository layout

- `backend` - Spring Boot API and realtime backend
- `web` - React web client
- `docs` - architecture notes

## Local run

### Requirements

- Docker Desktop

### Full stack in Docker

```bash
docker compose up --build
```

After startup:

- web app: `http://localhost:3000`
- backend API: `http://localhost:8080`
- backend health: `http://localhost:8080/actuator/health`

Stop everything:

```bash
docker compose down
```

Reset database and Redis volumes too:

```bash
docker compose down -v
```

### Local development without Docker for app processes

Requirements for this mode:

- Java 17+
- Maven 3.9+
- Node.js 22+

Infrastructure only:

```bash
docker compose up -d postgres redis
```

Backend:

```bash
cd backend
mvn spring-boot:run
```

Web:

```bash
cd web
npm install
npm run dev
```

The Vite client expects the backend at `http://localhost:8080` and Vite at `http://localhost:5173`.

## Environment

Use values from `.env.example` in your local environment or preferred secret manager.

## Next production steps

- move from the simple in-process STOMP broker to a clustered broker or dedicated realtime gateway
- add refresh tokens and device/session management
- add read receipts, typing indicators, attachments and moderation tooling
- introduce Redis-backed presence and message fan-out for multi-node deployment
- add integration tests with Testcontainers in CI
