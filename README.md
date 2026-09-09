# nestjs-routing-authorization

NestJS backend template for routing, authentication, authorization, account management, and administrator workflows.

Companion frontend: [react-routing-authorization](https://github.com/aleksr777/react-routing-authorization)

## Environment

Copy `.env.example` to `.env` and adjust the values for your environment.

```env
JWT_ACCESS_SECRET='secret_access_key'
JWT_REFRESH_SECRET='secret_refresh_key'
JWT_ACCESS_EXPIRES_IN='15m'
JWT_REFRESH_EXPIRES_IN='7d'

ADMIN_TRANSFER_TOKEN_EXPIRES_IN=300
REGISTRATION_TOKEN_EXPIRES_IN=600
RESET_TOKEN_EXPIRES_IN=600
EMAIL_CHANGE_TOKEN_EXPIRES_IN=600
PASSWORD_CHANGE_TOKEN_EXPIRES_IN=600

REDIS_HOST='localhost'
REDIS_PORT=6379

SERVER_PORT=5174
FRONTEND_URL='http://localhost:5173'

DB_TYPE='postgres'
DB_HOST='localhost'
DB_PORT=5432
DB_NAME='DB_NAME'
DB_USERNAME='postgres'
DB_PASSWORD='DB_PASSWORD'
DB_TYPEORM_SYNC=true

SMTP_HOST='smtp.gmail.com'
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER='service@gmail.com'
SMTP_FROM='service@gmail.com'
SMTP_PASS='SMTP_PASS'

INITIAL_ADMIN_EMAIL='user@gmail.com'
INITIAL_ADMIN_PASSWORD='INITIAL_ADMIN_PASSWORD'
INITIAL_ADMIN_NICKNAME='INITIAL_ADMIN_NICKNAME'
```

`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, and `INITIAL_ADMIN_NICKNAME` are used only by the initial administrator migration. They are not used to identify the current administrator during normal runtime because administrator rights can be transferred to another user.

## Run locally

### Prerequisites

- Node.js
- Docker / Docker Compose
- PostgreSQL and Redis, or the containers from `docker-compose.yml`

Start PostgreSQL and Redis:

```bash
docker-compose up -d
```

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run start:dev
```

The backend uses port `5174` by default and exposes routes under the global `/api` prefix.

## Initial administrator

The initial administrator is created by the `CreateAdminUser` migration. The migration reads only the `INITIAL_ADMIN_*` variables listed above.

Run migrations with:

```bash
npx typeorm-ts-node-commonjs migration:run -d data-source.ts
```

The migration creates the first administrator or promotes/updates the matching existing user according to the migration logic. After that, the current administrator is determined from the database by `role = admin`.

## Authentication model

- The access token is returned in the JSON response and is intended for the client application.
- The refresh token is stored in an HttpOnly cookie and is not returned to frontend JavaScript.
- Refresh requests rotate the active authentication state through `/api/auth/refresh-tokens`.
- Logout clears the refresh cookie and invalidates the current access session.
- Blocked users do not receive access or refresh tokens when they try to log in.
- A blocked-login response contains `blocked_reason` and the email of the current administrator. The administrator email is resolved dynamically from the database, not from an environment variable.
- JWT and refresh strategies re-check the current user in the database, so blocked users and users whose role has changed do not keep stale authorization privileges.

## Administrator rights transfer

Administrator rights are transferable and are not tied to the initial administrator email.

### Initiation

`POST /api/admin/transfer/initiate`

Body:

```json
{
  "id": 123,
  "password": "current-administrator-password"
}
```

Before an invitation is created, the backend verifies the current administrator's password. The password is used only for bcrypt comparison and is not stored in Redis or included in the email.

Only one administrator-rights transfer may be pending at a time. A Redis lock is created atomically with `NX` and expires using `ADMIN_TRANSFER_TOKEN_EXPIRES_IN`. Concurrent attempts to create another transfer are rejected with `409 Conflict`.

### Status

`GET /api/admin/transfer/status`

Example response:

```json
{
  "pending": true,
  "target_user_id": 123
}
```

The transfer is considered active only while both the pending lock and the corresponding transfer code remain valid.

### Confirmation by recipient

`POST /api/admin/transfer/confirm`

Body:

```json
{
  "code": "123456",
  "password": "recipient-current-password"
}
```

The recipient must be the user for whom the invitation was issued and must confirm both the six-digit code and their own current password. The role change is performed transactionally with database row locking:

- current administrator: `admin -> user`
- recipient: `user -> admin`

After a successful transfer, the old administrator immediately loses access to administrator endpoints because the current role is loaded from the database.

### Cancellation

`DELETE /api/admin/transfer/cancel`

The administrator who initiated the transfer can cancel it while it is still pending. Cancellation invalidates both the Redis pending lock and the transfer code immediately. Confirmation and cancellation are serialized with database row locking so they cannot both complete successfully.

If no action is taken before the TTL expires, Redis removes the transfer state automatically.

## API endpoints

### Auth

- `POST /api/auth/login` — authenticate; blocked accounts receive block information instead of tokens
- `POST /api/auth/logout` — logout and clear refresh state
- `POST /api/auth/refresh-tokens` — refresh authentication tokens
- `POST /api/auth/registration/request` — request registration code
- `POST /api/auth/registration/confirm` — confirm registration
- `POST /api/auth/password-reset/request` — request public password reset
- `POST /api/auth/password-reset/confirm` — confirm public password reset

### Current user

All routes below require a valid access token.

- `GET /api/users/me` — get current profile
- `PATCH /api/users/me/partial-data/update` — update supported profile fields
- `POST /api/users/me/email/update/request` — request email change
- `POST /api/users/me/email/update/confirm` — confirm email change
- `POST /api/users/me/password/change/request` — verify current password and start password change
- `POST /api/users/me/password/change/confirm` — confirm password change
- `POST /api/users/me/password/reset/request` — request password reset for the authenticated user
- `POST /api/users/me/password/reset/confirm` — confirm authenticated-user password reset
- `DELETE /api/users/me/delete` — delete current account after password verification

### Admin

All routes below require a valid access token and the current `admin` role.

- `GET /api/admin/users/find` — paginated user search; administrator accounts are excluded
- `GET /api/admin/users/:id` — get a managed user's details
- `PATCH /api/admin/users/block/:id` — block a user
- `PATCH /api/admin/users/unblock/:id` — unblock a user
- `DELETE /api/admin/users/delete/:id` — delete a user
- `GET /api/admin/transfer/status` — get active administrator-transfer status
- `POST /api/admin/transfer/initiate` — initiate transfer after administrator password verification
- `DELETE /api/admin/transfer/cancel` — cancel the active transfer while still pending
- `POST /api/admin/transfer/confirm` — recipient confirms transfer with code and current password

## Security notes

- Administrator authorization is enforced on the backend with JWT and role guards; frontend route guards are only a UX layer.
- Blocked users are rejected by protected authentication strategies even if they still possess previously issued tokens.
- Administrator transfer codes are unique six-digit Redis-backed verification codes.
- A global pending-transfer lock prevents multiple simultaneous administrator-transfer invitations.
- Transfer confirmation and cancellation are protected against races with database pessimistic locks.
- The initial administrator environment variables are migration-only and are not a source of runtime authorization state.
