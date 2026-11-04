# Authentication and Sessions

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register` | Create an account. New accounts get the least-privileged role (Support) |
| `POST /auth/login` | Sign in; returns an access token and sets the refresh cookie |
| `POST /auth/refresh` | Trade the refresh cookie for a new access token (and a new cookie) |
| `POST /auth/logout` | End the session and clear the cookie |
| `GET /auth/me` | The signed-in user with their permissions |
| `POST /auth/forgot-password` | Email a reset link. Always answers the same, so it never reveals which emails exist |
| `POST /auth/reset-password` | Set a new password with the emailed token |
| `POST /users/me/password` | Change your password |

## Tokens

- **Access token:** a JWT valid for 15 minutes (`JWT_EXPIRES_IN`), kept in the app's memory and sent as
  `Authorization: Bearer …`. A page reload quietly gets a new one from the refresh cookie.
- **Refresh token:** random, stored hashed in the database, valid 7 days (`REFRESH_TOKEN_TTL_DAYS`). The cookie is
  `httpOnly`, `SameSite=Strict`, scoped to `/api/auth`, and `Secure` in production.
- **Rotation:** every refresh issues a new token and retires the old one. If a retired token is used again more than
  10 seconds later, it is treated as theft and the whole session family is revoked. Two browser tabs refreshing at the
  same moment fall inside the 10-second window and are fine.
- **Signing out everywhere:** changing or resetting your password revokes all your sessions.

## Passwords

- Hashed with bcrypt; never stored or logged in plain text.
- At least 8 characters with a lowercase letter, an uppercase letter and a number.
- Sign-in answers "Invalid email or password" for a wrong password, an unknown email and an inactive account alike, and
  does the same amount of work in each case so timing doesn't give it away.

## Password reset

The emailed token is random, stored only as a hash, valid for 60 minutes (`RESET_TOKEN_TTL_MINUTES`), and usable once.
Asking for a new link cancels earlier unused ones. In development, emails land in Mailpit at http://localhost:8025.

## Abuse protection and audit

- Sign-in, registration, forgot-password and reset-password allow 20 requests per 15 minutes per IP.
- These events go in the audit log: `LOGIN`, `LOGIN_FAILED` (with the real reason, visible to admins only),
  `PASSWORD_CHANGE`, `PASSWORD_RESET`, and `ROLE_CHANGE`.
