# Architecture

Context Bridge uses GitHub for distribution and one shared MCP service for live collaboration.

```text
GitHub repository
├── plugin.json, mcp.json, skills/    distributed to every device
├── server/                           deployed once by the service operator
└── scripts/join-workspace.ps1        invite onboarding helper

Device A ─┐
Device B ─┼── HTTPS ── one shared MCP service ── persistent store
Device C ─┘
```

## Responsibilities

- GitHub distributes plugin files, installation metadata, source code, and updates.
- The shared MCP service owns identities, memberships, invites, checkpoints, and audit-relevant timestamps.
- Devices install the plugin and connect to the same `mcp.json` URL. They do not run separate stores.
- Git or a separate object store carries large project files. Checkpoints carry context, hashes, and source references.

## Invite onboarding

1. An owner creates a one-time invite with the minimum role and an expiry.
2. A new device runs `scripts/join-workspace.ps1` and enters the invite code.
3. `POST /onboarding/join` creates a profile, consumes the invite, and returns a personal API key once.
4. The helper stores the key only in the Git-ignored `connection.local.json` file.
5. The user supplies that key when the installed plugin requests authentication.

Invite codes and issued API keys are SHA-256 hashed before persistence. Production should replace API-key bootstrap with OAuth 2.1 while retaining the same workspace membership model.

## Deployment invariant

Every installed plugin must point at the same stable HTTPS MCP endpoint. Running one isolated server per device creates unrelated workspaces and is not a supported collaboration topology.
