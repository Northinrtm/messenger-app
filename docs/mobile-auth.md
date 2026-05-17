# Mobile Auth Contract

## Decision

Android does not use the browser cookie-based refresh flow.

The mobile client uses dedicated JSON-based auth endpoints:

- `POST /api/mobile/auth/register`
- `POST /api/mobile/auth/login`
- `POST /api/mobile/auth/refresh`
- `POST /api/mobile/auth/logout`

`register`, `login`, and `refresh` return:

- access token
- access token expiry
- session id
- user profile
- refresh token

`logout` accepts the refresh token in the request body and revokes the session without relying on cookies.

On Android, only the `refreshToken` is persisted to secure storage. Access tokens stay in memory and are restored by calling `/api/mobile/auth/refresh` on app startup.

## Rationale

- native Android must not depend on browser cookie jar behavior
- refresh token ownership should be explicit in the mobile client
- backend session semantics should stay aligned with the web client
- websocket auth can continue using bearer access tokens

## Security Notes

- web keeps using the existing cookie-based `/api/auth/*` flow
- mobile refresh tokens remain opaque session-bound secrets issued by `AuthService`
- mobile auth endpoints are still rate-limited by `AuthEndpointProtectionFilter`
- cross-site browser requests with a hostile `Origin` are still rejected
- unlike cookie endpoints, mobile endpoints are allowed to work without `Origin` / `Referer` headers because native apps do not provide browser fetch metadata

## Current Boundary

- this contract is Android-first
- it does not yet add native push registration or a full mobile API client implementation
- password reset and email verification continue to use the existing backend endpoints because they are not refresh-cookie dependent
