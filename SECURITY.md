# Security configuration

## HTTP headers

The backend applies Helmet to API responses. Because this service returns JSON rather than HTML, Content Security Policy and document-oriented cross-origin policies are disabled here; CSP should be configured by the frontend that serves HTML.

When `REFRESH_COOKIE_SECURE=true`, the backend also sends HSTS with a 180-day max age. HSTS subdomain inheritance and preload are intentionally disabled to avoid applying policy to unrelated hosts.

## Refresh cookie

Local development defaults:

```env
REFRESH_COOKIE_SECURE=false
REFRESH_COOKIE_SAME_SITE='lax'
```

For a production deployment over HTTPS, use:

```env
REFRESH_COOKIE_SECURE=true
```

If the frontend and API are cross-site, also use:

```env
REFRESH_COOKIE_SAME_SITE='none'
```

`SameSite=None` is rejected at startup unless `Secure=true`.

The refresh cookie is HttpOnly, scoped to `/api/auth`, and uses high cookie priority. The raw refresh token is not exposed to frontend JavaScript.

## Refresh Origin protection

`POST /api/auth/refresh-tokens` authenticates with an HttpOnly cookie, so it additionally requires an `Origin` header matching the origin derived from `FRONTEND_URL`.

Requests with a missing, malformed, or different Origin are rejected with HTTP 403 before refresh-token validation or rotation runs.

This protection is intentionally applied to the cookie-authenticated refresh endpoint. Endpoints authenticated by the `Authorization` header do not rely on browser cookies for authentication and therefore do not use this Origin guard.

## Reverse proxies and client IP addresses

IP-based login and API rate limits use Express `req.ip`. The application therefore configures Express `trust proxy` from `TRUST_PROXY`.

Local/default configuration:

```env
TRUST_PROXY='false'
```

Behind a reverse proxy, configure the exact trusted topology, for example a fixed hop count:

```env
TRUST_PROXY='1'
```

or a trusted proxy address/subnet supported by Express proxy settings.

`TRUST_PROXY=true` is deliberately rejected because trusting arbitrary forwarded client IP values allows attackers to spoof `X-Forwarded-For` and undermine IP-based rate limiting. A hop-count configuration is safe only when the application cannot be reached through a shorter untrusted network path; trusted proxy IP/subnet configuration is preferable for more complex production networks.

## Deployment requirements

Production should terminate HTTPS before requests reach browser clients, use `REFRESH_COOKIE_SECURE=true`, and keep PostgreSQL and Redis off the public network. Configure `FRONTEND_URL` to the exact browser origin allowed to call the API.
