# Shared service deployment

The service operator deploys exactly one Context Bridge service. Client devices do not perform these steps.

## Configure

1. Copy `.env.production.example` to `.env.production` outside version control.
2. Set `PUBLIC_BASE_URL` to the stable HTTPS origin.
3. Replace the bootstrap owner key with a long random secret.
4. Put an HTTPS reverse proxy or managed load balancer in front of port 8787.
5. Keep the data volume persistent and backed up.

## Run with Docker Compose

```sh
docker compose up -d --build
docker compose ps
```

Only the loopback port is published by default. The HTTPS reverse proxy should forward `/mcp`, `/health`, `/info`, and `/onboarding/join` to `127.0.0.1:8787`.

## Configure the distributable plugin

Before tagging a release, run:

```powershell
.\scripts\configure-distribution.ps1 `
  -Repository Liy0413/context-bridge `
  -ServiceUrl https://bridge.example.com
```

This sets the GitHub repository metadata and the single shared MCP endpoint.

## Production hardening

- Replace development API keys with MCP-compatible OAuth 2.1.
- Replace the JSON store with PostgreSQL before running multiple service replicas.
- Add a distributed rate limiter, audit log, member removal, credential revocation, and backup restoration tests.
- Use object storage for large artifacts and keep secrets out of checkpoints.
