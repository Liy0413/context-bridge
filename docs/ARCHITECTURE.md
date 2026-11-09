# Architecture

Context Bridge uses GitHub for distribution and one ordinary public HTTPS service for live collaboration. It does not require OpenAI Platform or Secure MCP Tunnel.

```text
GitHub repository
├── plugin.json, mcp.json, skills/    distributed to every device
├── server/                           deployed once by the service operator
└── scripts/join-workspace.ps1        invite onboarding helper

Device A ─┐
Device B ─┼── HTTPS ── one shared MCP service ── persistent store
Device C ─┘

Trusted LAN device ── UDP discovery + HTTP onboarding ──┘
```

## Responsibilities

- GitHub distributes plugin files, installation metadata, source code, and updates.
- The shared MCP service owns identities, memberships, invites, checkpoints, and audit-relevant timestamps.
- Devices install the plugin and connect to the same `mcp.json` URL. They do not run separate stores.
- The HTTPS endpoint may be hosted on a VPS, container platform, or another Node.js host. OpenAI Platform Tunnel is not part of the runtime path.
- Git or a separate object store carries large project files. Checkpoints carry context, hashes, and source references.

## Invite onboarding

1. An owner creates a one-time invite with the minimum role and an expiry.
2. A new device runs `scripts/join-workspace.ps1` and enters the invite code.
3. `POST /onboarding/join` creates a profile, consumes the invite, and returns a personal API key once.
4. The helper stores the key only in the Git-ignored `connection.local.json` file.
5. The user supplies that key when the installed plugin requests authentication.

Invite codes and issued API keys are SHA-256 hashed before persistence. Production should replace API-key bootstrap with OAuth 2.1 while retaining the same workspace membership model.

## Optional LAN discovery

When explicitly enabled, the same service also listens for the fixed `CONTEXT_BRIDGE_DISCOVER_V1` datagram on UDP 8788. It replies only to the sender with non-secret metadata: protocol version, service ID, HTTP port, and the fact that an invite is required. The client constructs the private IPv4 URL from the UDP sender address, verifies `/health`, and then uses the existing invitation onboarding endpoint.

This is discovery of the existing central service, not peer-to-peer replication and not a second data store. It is disabled by default, uses no API keys in UDP packets, and must be limited by the host firewall to private networks. Because onboarding is plain HTTP on the LAN, it is intended only for trusted home or office networks; public HTTPS remains the normal transport outside the LAN.

## Deployment invariant

Every installed plugin must point at the same stable HTTPS MCP endpoint. The same origin also serves `/onboarding/join`, so invitation onboarding works from a new device before it has an API key. Running one isolated server per device creates unrelated workspaces and is not a supported collaboration topology.

## Network boundary

The public reverse proxy forwards only the Context Bridge HTTP routes to the single service instance. The service itself may remain on a private container network. TLS terminates at the reverse proxy, and `TRUST_PROXY=1` tells Express to trust exactly that proxy hop when applying onboarding rate limits.

For temporary development, a third-party tunnel may forward a random HTTPS URL to `127.0.0.1:8787`. That proves connectivity but is not a distribution endpoint because the URL changes and depends on the operator's computer remaining online.
