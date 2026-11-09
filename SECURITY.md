# Security policy

Do not commit API keys, invite codes, `.env` files, `connection.local.json`, `credentials.local.json`, or server data.

Report suspected credential exposure privately to the repository owner. Rotate exposed credentials immediately and invalidate affected invitations.

Development API-key authentication is intended for private testing. A public deployment should use MCP-compatible OAuth 2.1, TLS, server-side authorization checks, rate limiting, audit logs, and documented data deletion procedures.

Do not treat a temporary public tunnel URL as an access control. The onboarding endpoint is intentionally reachable before authentication, so invitation entropy, expiry, one-time use, TLS, and rate limiting are required. Keep the host and persistent store patched and backed up.
