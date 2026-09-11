# nestjs-routing-authorization

NestJS backend template for routing, authentication, authorization, account management, and administrator workflows.

Companion frontend: [react-routing-authorization](https://github.com/aleksr777/react-routing-authorization)

## Feature overview

The backend provides:

- registration with email verification codes;
- login, logout, access-token refresh, and password recovery;
- access tokens plus an HttpOnly refresh-token cookie;
- SHA-256 refresh-token hashing, atomic rotation, and refresh-token reuse detection;
- current-user profile reading and partial editing;
- email change and password change/reset confirmation flows;
- self-account deletion with password verification;
- blocked-account handling with an administrator-provided reason and current administrator contact email;
- role-based administrator endpoints for user search, viewing, blocking, unblocking, and deletion;
- current-administrator password verification before blocking or deleting another user;
- transferable administrator rights with password verification on both sides;
- one active administrator-rights transfer at a time;
- cancellation and TTL expiration of pending administrator transfers;
- Redis-backed login, public-verification, auth-route, and global API rate limiting;
- Redis-backed one-time verification codes, confirmation-attempt limits, resend cooldowns, temporary verification lockouts, and pending-transfer state;
- transaction and pessimistic-lock protection for administrator role transfer, refresh-token rotation, and password-protected destructive admin actions.

## Tech stack

- NestJS 11
- TypeScript
- TypeORM
- PostgreSQL
- Redis
- Passport / JWT
- bcrypt
- Nodemailer
- class-validator / class-transformer
- Docker Compose for local PostgreSQL and Redis

## Environment

Copy `.env.example` to `.env` and adjust the values for your environment.

```env
JWT_ACCESS_SECRET='secret_access_key'
JWT_REFRESH_SECRET='secret_refresh_key'
JWT_ACCESS_EXPIRES_IN='15m'
JWT_REFRESH_EXPIRES_IN='7d'

ADMIN_TRANSFER_TOKEN_EXPIRES_IN=300
REGISTRATION_TOKEN_EXPIRES_IN=300
RESET_TOKEN_EXPIRES_IN=300
EMAIL_CHANGE_TOKEN_EXPIRES_IN=300
PASSWORD_CHANGE_TOKEN_EXPIRES_IN=300
VERIFICATION_CODE_RESEND_COOLDOWN=60
REGISTRATION_VERIFICATION_LOCKOUT=180
PASSWORD_RESET_VERIFICATION_LOCKOUT=180
EMAIL_CHANGE_VERIFICATION_LOCKOUT=180

LOGIN_EMAIL_MAX_ATTEMPTS=5
LOGIN_IP_MAX_ATTEMPTS=20
LOGIN_RATE_LIMIT_WINDOW=300

PUBLIC_VERIFICATION_IP_MAX_REQUESTS=20
PUBLIC_VERIFICATION_IP_RATE_LIMIT_WINDOW=600

AUTH_IP_MAX_REQUESTS=120
AUTH_RATE_LIMIT_WINDOW=60
API_IP_MAX_REQUESTS=600
API_RATE_LIMIT_WINDOW=60

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

Verification timing defaults in the example configuration are:

- `ADMIN_TRANSFER_TOKEN_EXPIRES_IN=300` — administrator-transfer confirmation code is valid for 5 minutes;
- `REGISTRATION_TOKEN_EXPIRES_IN=300` — registration code is valid for 5 minutes;
- `RESET_TOKEN_EXPIRES_IN=300` — password-reset code is valid for 5 minutes;
- `EMAIL_CHANGE_TOKEN_EXPIRES_IN=300` — email-change code is valid for 5 minutes;
- `PASSWORD_CHANGE_TOKEN_EXPIRES_IN=300` — password-change code is valid for 5 minutes;
- `VERIFICATION_CODE_RESEND_COOLDOWN=60` — registration and public password-reset codes cannot be requested more often than once per minute for the same normalized email;
- `REGISTRATION_VERIFICATION_LOCKOUT=180` — registration is locked for 3 minutes after 5 incorrect confirmation codes for the same normalized email;
- `PASSWORD_RESET_VERIFICATION_LOCKOUT=180` — public password reset is locked for 3 minutes after 5 incorrect confirmation codes for the same normalized email;
- `EMAIL_CHANGE_VERIFICATION_LOCKOUT=180` — email change is locked for 3 minutes after 5 incorrect confirmation codes for the authenticated user.

Login-rate defaults are:

- `LOGIN_EMAIL_MAX_ATTEMPTS=5` — maximum failed login attempts for one normalized email during the rate-limit window;
- `LOGIN_IP_MAX_ATTEMPTS=20` — maximum failed login attempts from one IP during the rate-limit window;
- `LOGIN_RATE_LIMIT_WINDOW=300` — 5-minute fixed window for login-failure counters.

Additional IP-rate defaults are:

- `PUBLIC_VERIFICATION_IP_MAX_REQUESTS=20` — maximum combined registration/resend/public-password-reset code requests from one IP during the public-verification window;
- `PUBLIC_VERIFICATION_IP_RATE_LIMIT_WINDOW=600` — 10-minute fixed window for the public-verification IP counter;
- `AUTH_IP_MAX_REQUESTS=120` — maximum requests to `/api/auth/*` from one IP during the auth-rate window;
- `AUTH_RATE_LIMIT_WINDOW=60` — 1-minute fixed window for the `/api/auth/*` IP counter;
- `API_IP_MAX_REQUESTS=600` — maximum API requests from one IP during the global API window;
- `API_RATE_LIMIT_WINDOW=60` — 1-minute fixed window for the global API IP counter.

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
- Only a SHA-256 hash of the current refresh token is stored in the `refresh_token` database column; the raw refresh token is never persisted there.
- Every generated refresh JWT contains a unique `jti`, so refresh-token rotation always produces a distinct token even when tokens are issued within the same second.
- Refresh requests rotate the refresh token through `/api/auth/refresh-tokens`.
- Refresh-token comparison and rotation run inside a database transaction with a `pessimistic_write` lock on the user row.
- If an already-rotated or otherwise non-current refresh token is presented, the backend treats it as possible token reuse, clears the currently stored refresh-token hash, and requires a fresh login.
- Logout clears the refresh-token hash and invalidates the current access session.
- Blocked users do not receive access or refresh tokens when they try to log in.
- A blocked-login response contains `blocked_reason` and the email of the current administrator. The administrator email is resolved dynamically from the database, not from an environment variable.
- JWT and refresh strategies re-check the current user in the database, so blocked users and users whose role has changed do not keep stale authorization privileges.

Existing database rows created before refresh-token hashing may contain plaintext refresh tokens. After deployment of the hashing change, those old refresh sessions are intentionally treated as non-current and are invalidated on the next refresh attempt. Affected users need to log in once again; new sessions store only the hash.

### Authentication flow

```text
Login / registration / password reset
        ↓
backend issues access + refresh tokens
        ↓
access token → JSON response → frontend memory
refresh token → HttpOnly cookie
SHA-256(refresh token) → database
        ↓
protected request with Bearer access token
        ↓
JwtStrategy validates token and reloads current user from DB
        ↓
blocked status / current role are re-evaluated
        ↓
access token expires or approaches expiry
        ↓
POST /api/auth/refresh-tokens using HttpOnly refresh cookie
        ↓
lock user row → compare current hash → rotate refresh token atomically
        ↓
new access token + new refresh cookie + new stored refresh-token hash
```

The frontend route guards improve UX, but backend JWT and role guards are the authorization boundary.

## Login rate limiting

Failed login attempts are tracked in Redis by both normalized email and client IP. The example configuration allows up to 5 failed attempts for one email and 20 failed attempts from one IP within a 5-minute fixed window.

Before password validation, the backend checks both counters. If either limit has already been reached, login is rejected with HTTP `429 Too Many Requests` and a `retry_after` value based on the Redis TTL.

On an invalid email/password attempt, both counters are incremented with the atomic Redis increment-with-expiry operation. On a successful login, the email-specific failure counter is cleared. The IP counter is intentionally not cleared by a successful login, so one valid login cannot reset abuse accumulated for the same source IP.

## API and public-verification rate limiting

In addition to login-failure counters, the backend applies three IP-based anti-flood layers:

- registration request/resend and public password-reset request share a stricter Redis counter per client IP;
- every `/api/auth/*` request is covered by an auth-route IP counter;
- every API request is covered by a more permissive global IP counter.

These counters use the same atomic Redis increment-with-expiry primitive. A request that exceeds a limit receives HTTP `429 Too Many Requests` with `retry_after` based on the remaining Redis TTL. Specialized limits remain stricter than the general API limit.

The IP keys use Express `req.ip`. In production behind nginx, Cloudflare, or another reverse proxy, configure Express proxy trust only for the actual trusted proxy chain. Without correct proxy configuration the backend may see the proxy address instead of the client; overly broad proxy trust can allow forged forwarded IP headers.

## Verification-code protection

Six-digit verification codes are protected against repeated guessing with Redis-backed failure counters.

- ordinary confirmation flows allow up to `5` incorrect code attempts;
- administrator-rights transfer confirmation allows up to `3` incorrect code attempts;
- verification-code TTLs are 5 minutes in the example configuration;
- counters increment and receive their TTL atomically in Redis;
- successful confirmation clears the corresponding failure counter;
- authenticated flows are scoped to the authenticated user ID;
- public registration and public password reset are scoped to the normalized email address supplied during the request and confirmation flow.

Registration, public password reset, and authenticated email change add a temporary lockout after the fifth incorrect code. The example configuration uses a 3-minute lockout. While a lockout is active, the corresponding request/resend/confirm operation is rejected by the backend. The Redis lockout key expires automatically, and responses expose `retry_after` so the frontend can display the remaining time.

For registration and public password reset, the lockout is scoped to the normalized email. For email change, the lockout is scoped to the authenticated user ID. These lockouts are independent from the administrator-controlled `is_blocked` account flag.

### Registration and public password-reset resend cooldown

A new registration code or public password-reset code cannot be requested for the same email until `VERIFICATION_CODE_RESEND_COOLDOWN` seconds have elapsed. The default example configuration is `60` seconds.

The cooldown is enforced in Redis with atomic `SET ... NX EX`. The same public endpoints are also subject to the shared IP request limit described above. A request made too early or after an IP limit is exceeded receives HTTP `429 Too Many Requests` with `retry_after`.

Successful code-request responses include the values needed by the frontend to display the per-email resend restriction:

```json
{
  "message": "If the email exists, we’ve sent you a code.",
  "retry_after": 60,
  "max_attempts": 5
}
```

When a new registration or public password-reset code is successfully issued:

- the failed-attempt counter for that email starts a new confirmation cycle;
- the newly issued code becomes the active challenge;
- the previous code for that registration/password-reset challenge is invalidated;
- only the latest active code can be confirmed.

Registration uses `POST /api/auth/registration/resend` to resend an existing registration challenge without keeping the user's plaintext registration password in frontend state. Public password reset reuses `POST /api/auth/password-reset/request` for resends.

For administrator transfer, if the intended recipient reaches the third incorrect-code attempt while the transfer is still pending, the pending transfer and its confirmation code are invalidated immediately.

## Password-protected administrator actions

Blocking and deleting another user require the current administrator to re-enter their current password. The backend does not trust the frontend confirmation alone.

For both operations, the backend starts a database transaction, obtains a `pessimistic_write` lock on the administrator row, re-checks that the requester still has the `admin` role, verifies the supplied password with bcrypt, and only then locks and modifies the target user. This prevents a request that passed the route guard before a concurrent administrator-rights transfer from completing with stale administrator privileges.

`PATCH /api/admin/users/block/:id`

```json
{
  "blocked_reason": "optional reason",
  "password": "current-administrator-password"
}
```

`DELETE /api/admin/users/delete/:id`

```json
{
  "password": "current-administrator-password"
}
```

Unblocking currently requires an explicit UI confirmation but does not require password re-entry.

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

- `POST /api/auth/login` — authenticate; Redis rate limits failed attempts by normalized email and IP; auth/global IP limits also apply
- `POST /api/auth/logout` — logout and clear refresh state
- `POST /api/auth/refresh-tokens` — atomically rotate the current refresh token; reuse of a non-current refresh token revokes the current refresh session
- `POST /api/auth/registration/request` — request the initial registration code; email cooldown, verification lockout, public-verification IP limit, auth IP limit, and global API limit apply
- `POST /api/auth/registration/resend` — resend the active registration challenge; the same request limits apply
- `POST /api/auth/registration/confirm` — confirm the latest active registration code; maximum 5 incorrect attempts before temporary lockout
- `POST /api/auth/password-reset/request` — request/resend a public password-reset code; the public-verification, auth, and global IP limits apply
- `POST /api/auth/password-reset/confirm` — confirm the latest active public password-reset code; maximum 5 incorrect attempts before temporary lockout

### Current user

All routes below require a valid access token.

- `GET /api/users/me` — get current profile
- `PATCH /api/users/me/partial-data/update` — update supported profile fields
- `POST /api/users/me/email/update/request` — request email change; verification lockout applies
- `GET /api/users/me/email/update/status` — get current email-change verification lockout status and remaining time
- `POST /api/users/me/email/update/confirm` — confirm email change; maximum 5 incorrect attempts before temporary lockout
- `POST /api/users/me/password/change/request` — verify current password and start password change
- `POST /api/users/me/password/change/confirm` — confirm password change with user-scoped attempt limiting
- `POST /api/users/me/password/reset/request` — request password reset for the authenticated user
- `POST /api/users/me/password/reset/confirm` — confirm authenticated-user password reset with user-scoped attempt limiting
- `DELETE /api/users/me/delete` — delete current account after password verification

### Admin

All routes below require a valid access token and the current `admin` role, except transfer confirmation: the recipient must be authenticated but is still a regular user before accepting the administrator role.

- `GET /api/admin/users/find` — paginated user search; administrator accounts are excluded
- `GET /api/admin/users/:id` — get a managed user's details
- `PATCH /api/admin/users/block/:id` — block a user after current-administrator password verification
- `PATCH /api/admin/users/unblock/:id` — unblock a user
- `DELETE /api/admin/users/delete/:id` — delete a user after current-administrator password verification
- `GET /api/admin/transfer/status` — get active administrator-transfer status
- `POST /api/admin/transfer/initiate` — initiate transfer after administrator password verification
- `DELETE /api/admin/transfer/cancel` — cancel the active transfer while still pending
- `POST /api/admin/transfer/confirm` — authenticated recipient confirms transfer with code and current password; maximum 3 incorrect-code attempts

## Security properties

- Administrator authorization is enforced on the backend with JWT and role guards; frontend route guards are only a UX layer.
- Blocked users are rejected by protected authentication strategies even if they still possess previously issued tokens.
- Raw refresh tokens are not persisted in the database; only SHA-256 hashes are stored.
- Refresh tokens are uniquely identified with `jti`, rotated under a database pessimistic lock, and reuse of a non-current token invalidates the current refresh session.
- Failed login attempts are rate-limited in Redis by both normalized email and client IP.
- Public registration/password-reset code requests are additionally rate-limited by client IP across email addresses.
- `/api/auth/*` traffic has an IP anti-flood limit, and all API traffic has a more permissive global IP anti-flood limit.
- Verification-code confirmation failures are limited with Redis-backed counters: 5 attempts for normal flows and 3 for administrator transfer.
- Verification codes expire after 5 minutes with the example environment configuration.
- Registration and public password-reset resend requests are rate-limited per normalized email with a 60-second Redis cooldown.
- Registration and public password reset are temporarily locked per normalized email for 3 minutes after 5 incorrect codes.
- Email change is temporarily locked per authenticated user ID for 3 minutes after 5 incorrect codes.
- Reissuing registration/public reset codes invalidates the previous challenge code.
- Blocking and deleting users require current-administrator password re-verification on the backend.
- Password-protected block/delete operations re-check the administrator role under a database pessimistic lock.
- Critical administrator transfer initiation requires the current administrator's password.
- Transfer acceptance requires both the recipient's six-digit invitation code and current password.
- Administrator transfer codes are unique six-digit Redis-backed verification codes.
- A global Redis pending-transfer lock with `NX` prevents multiple simultaneous administrator-transfer invitations.
- Pending transfer state expires automatically with `ADMIN_TRANSFER_TOKEN_EXPIRES_IN`.
- Transfer confirmation and cancellation are protected against races with database pessimistic locks.
- Role changes are committed transactionally.
- The initial administrator environment variables are migration-only and are not a source of runtime authorization state.

## Deployment notes

The checked-in authentication cookie configuration is currently intended for local development: the refresh cookie uses `secure: false` and `sameSite: 'lax'`.

For production deployment, review the cookie and CORS configuration for the actual frontend/backend topology. In particular:

- use HTTPS and enable `Secure` cookies;
- choose an appropriate `SameSite` policy; cross-site frontend/backend deployments may require `SameSite=None` together with `Secure`;
- allow credentials only for trusted frontend origins;
- configure trusted proxy handling correctly before relying on `req.ip` for login, verification, auth-route, or global API rate limiting;
- use strong, unique JWT secrets and SMTP/database credentials;
- set `DB_TYPEORM_SYNC=false` in production and manage schema changes through migrations;
- keep PostgreSQL and Redis inaccessible from untrusted public networks;
- configure production values for `FRONTEND_URL`, database, Redis, and SMTP settings.

These are deployment recommendations; they are not all enabled by the current local-development configuration.
