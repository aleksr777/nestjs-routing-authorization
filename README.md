# nestjs-routing-authorization

A template for basic routing and authorization.

## 📄 Example environment file (.env)

```env
JWT_ACCESS_SECRET='secret_access_key'
JWT_REFRESH_SECRET='secret_refresh_key' 
JWT_ACCESS_EXPIRES_IN='15m'
JWT_REFRESH_EXPIRES_IN='7d'

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

### 🐘 Running PostgreSQL with Docker

This project uses Docker Compose to provide a local PostgreSQL instance.

To start the database:

```bash
docker-compose up -d
```

This will:
- Download and start a `postgres:17.5` container
- Expose it on `localhost:5432`
- Mount a volume to preserve data across restarts

To stop the database container:

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

The server will be available at:

```
http://localhost:1603/api
```

---

### 📌 Default API Endpoints

| Method | Endpoint              | Description                |
|--------|-----------------------|----------------------------|
| POST   | `/api/auth/register`  | Register new user          |
| POST   | `/api/auth/login`     | Login and receive tokens   |
| POST   | `/api/auth/refresh`   | Refresh tokens             |
| POST   | `/api/auth/logout`    | Invalidate refresh token   |
| GET    | `/api/users/me`       | Get current user profile   |

---
