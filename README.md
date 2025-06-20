# nestjs-routing-authorization

A template for basic routing and authorization.

## 📄 Example environment file (.env)

```env
JWT_ACCESS_SECRET='secret_access_key'
JWT_REFRESH_SECRET='secret_refresh_key' 
JWT_ACCESS_EXPIRES_IN='15m'
JWT_REFRESH_EXPIRES_IN='7d'

REDIS_HOST='localhost'
REDIS_PORT=6379   

SERVER_PORT=1603
FRONTEND_URL='http://localhost:1403'

DB_TYPE='postgres'
DB_HOST='localhost'
DB_PORT=5432
DB_NAME='db_name'
DB_USERNAME='postgres'
DB_PASSWORD='db_password'
DB_TYPEORM_SYNC=true

```

---

## 🚀 How to Run

### ✅ Prerequisites

Before you begin, make sure you have:

- [Node.js](https://nodejs.org/) installed (v18+ recommended)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (with WSL2 support if on Windows)
- `docker` and `docker-compose` available from your terminal

---

### 🐘 Running PostgreSQL and Redis with Docker

To start:

```bash
docker-compose up -d
```

This will:
- Download and start a `postgres:17.5` and `redis:7.2` containers

To stop the containers:

```bash
docker-compose down
```

To stop and remove all data:

```bash
docker-compose down -v
```

---

### 🧪 Running the NestJS Application

1. Install dependencies:

```bash
npm install
```

2. Start the server in development mode:

```bash
npm run start:dev
```

---

## 📡 API Endpoints

### Auth
- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login and receive tokens
- `POST /api/auth/logout` — Logout user
- `POST /api/auth/refresh` — Refresh tokens

### Users
- `GET /api/users/me` — Get current user's profile
- `DELETE /api/users/me/delete` — Delete current user
- `PATCH /api/users/me/update` — Update current user
- `GET /api/users` — Get list of users (with query support)

---
