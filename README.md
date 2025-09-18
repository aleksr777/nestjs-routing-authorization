# nestjs-routing-authorization

A template for basic routing and authorization.

## 📄 Example environment file (.env)

```env
JWT_ACCESS_SECRET='secret_access_key'
JWT_REFRESH_SECRET='secret_refresh_key'
JWT_ACCESS_EXPIRES_IN='15m'
JWT_REFRESH_EXPIRES_IN='7d'
ADMIN_TRANSFER_TOKEN_EXPIRES_IN=300  # 5m
REGISTRATION_TOKEN_EXPIRES_IN=900  # 15m
RESET_TOKEN_EXPIRES_IN=600  # 10m
EMAIL_CHANGE_TOKEN_EXPIRES_IN=600  # 10m

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

SMTP_HOST='smtp.gmail.com'
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER='official-email@gmail.com'
SMTP_PASS='aaaa bbbb cccc dddd'
SMTP_FROM='official-email@gmail.com'

ADMIN_EMAIL='admin@gmail.com'
ADMIN_PASSWORD='admin-password'
ADMIN_NICKNAME='admin-nickname'
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
### 📦 Database Migrations
Create a migration:
```bash
npx typeorm-ts-node-commonjs migration:create src/migrations/MigrationName
```
Run all pending migrations:
```bash
npx typeorm-ts-node-commonjs migration:run -d data-source.ts
```
Revert the last migration:
```bash
npx typeorm-ts-node-commonjs migration:revert -d data-source.ts
```


### 📦 👑 Admin User Creation

We use a dedicated migration to create an administrator account automatically:

Migration: CreateAdminUser<TIMESTAMP>.ts

Uses .env variables:
- ADMIN_EMAIL
- ADMIN_PASSWORD
- ADMIN_NICKNAME

Hashing is done using the HashService class

Run:
```bash
npx typeorm-ts-node-commonjs migration:run -d data-source.ts
```
This will create an admin user with the provided email and password or update the data of an existing user.
---

## 📡 API Endpoints

### Auth

- `POST /api/auth/login` — Login and receive tokens
- `POST /api/auth/logout` — Logout user
- `POST /api/auth/refresh-tokens` — Refresh tokens
- `POST /api/auth/registration/request` — Request registration
- `POST /api/auth/registration/confirm` — Confirm registration
- `POST /api/auth/password-reset/request` — Request password reset
- `POST /api/auth/password-reset/confirm` — Confirm password reset

### Users

- `GET /api/users/me` — Get current user's profile
- `POST /api/auth/email/update/request` — Request update email
- `POST /api/auth/email/update/confirm` — Confirm update email
- `DELETE /api/users/me/delete` — Delete current user

### Admin

- `GET /api/admin/users/find` — Get list of users (with query support)
- `PATCH /api/admin/users/block/:id` — Block user by ID
- `PATCH /api/admin/users/unblock/:id` — Unblock user by ID
- `POST /api/auth/transfer/initiate` — Initiate transfer of administrator rights
- `POST /api/auth/transfer/confirm` — Confirm transfer of administrator rights
- `DELETE /api/admin/users/delete/:id` — Delete user by ID


---
