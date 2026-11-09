# Public shared service deployment

The service operator deploys exactly one Context Bridge service. Client devices do not run the server and do not need OpenAI Platform Tunnel.

## Stable deployment: domain + Docker + Caddy

This is the recommended small production topology. It requires a Linux host with a public IP, a domain name, Docker, and persistent disk.

1. Point an `A`/`AAAA` record such as `bridge.example.com` to the host.
2. Copy `.env.production.example` to `.env.production` outside version control.
3. Set both values to the real hostname:

   ```dotenv
   CONTEXT_BRIDGE_DOMAIN=bridge.example.com
   PUBLIC_BASE_URL=https://bridge.example.com
   ```

4. Replace the bootstrap owner key with a long random secret. Keep `TRUST_PROXY=1` when using the included Caddy service.
5. Allow inbound TCP 80 and TCP/UDP 443. Do not expose port 8787 publicly.
6. Start the stack:

   ```sh
   docker compose --env-file .env.production -f docker-compose.public.yml up -d --build
   docker compose --env-file .env.production -f docker-compose.public.yml ps
   ```

Caddy obtains and renews the TLS certificate automatically. The Context Bridge container is reachable only from the internal Compose network, while its data lives in the `context-bridge-data` volume.

Verify from a different network:

```powershell
.\scripts\verify-public-service.ps1 -ServiceUrl https://bridge.example.com
```

Then configure the distributable plugin:

```powershell
.\scripts\configure-distribution.ps1 `
  -Repository Liy0413/context-bridge `
  -ServiceUrl https://bridge.example.com
```

Commit and tag the resulting `mcp.json` only after verification succeeds.

## Temporary test: Cloudflare Quick Tunnel

This path does not require OpenAI Platform and can be free, but the URL changes whenever the tunnel restarts and the host computer must stay online.

1. Start the local service with `scripts/start-server-dev.ps1`.
2. Install the official `cloudflared` binary.
3. Run:

   ```powershell
   .\scripts\start-cloudflare-quick-tunnel.ps1
   ```

4. Copy the generated `https://...trycloudflare.com` URL.
5. Verify it with `scripts/verify-public-service.ps1`.

Do not publish a Quick Tunnel URL in a stable release. For a lasting Cloudflare setup, create a named tunnel and attach a domain you control.

## Required public routes

The HTTPS origin must forward all of these routes to the same service instance:

- `GET /health`
- `GET /info`
- `POST /onboarding/join`
- `POST /mcp`

The onboarding route is what lets a new device exchange a one-time invitation for its personal API key. Exposing only `/mcp` breaks the invitation-first installation flow.

## Production hardening

- Replace development API keys with MCP-compatible OAuth 2.1 before a public marketplace submission.
- Replace the JSON store with PostgreSQL before running multiple service replicas.
- Add a distributed rate limiter, audit log, member removal, credential revocation, and backup restoration tests.
- Use object storage for large artifacts and keep secrets out of checkpoints.
- Back up the persistent data volume and test restoration.
