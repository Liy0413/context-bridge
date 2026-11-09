# Security policy

Do not commit API keys, invite codes, `.env` files, `connection.local.json`, `credentials.local.json`, or server data.

Report suspected credential exposure privately to the repository owner. Rotate exposed credentials immediately and invalidate affected invitations.

Development API-key authentication is intended for private testing. A public deployment should use MCP-compatible OAuth 2.1, TLS, server-side authorization checks, rate limiting, audit logs, and documented data deletion procedures.
