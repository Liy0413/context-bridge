---
name: context-bridge-join
description: Join an existing Context Bridge workspace on a new account or device using a one-time invite, including trusted-LAN discovery. Use when the user asks to connect, install, onboard, or join a shared workspace. Do not use for creating invitations.
---

# Join Context Bridge

Requires: Node.js 20 or newer and network access to a user-supplied Context
Bridge service. When `requirements.md` is available in the skill pack, read it
before onboarding.

Join the existing central service. Never start a separate Context Bridge data
store on a client device.

## Choose the route

- For normal remote onboarding, run `node scripts/join-workspace.mjs
  --service-url <https-service-url>`.
- On the same trusted private network as the server, run `node
  scripts/join-workspace.mjs --discover-lan`.
- If this skill is being used from the Context Bridge source repository, the
  repository's existing PowerShell onboarding helpers are also valid.

The helper asks for the invite without echoing it, exchanges it once, and saves
the issued personal credential to `connection.local.json`. Do not print the
invite or API key, put either value in a command-line argument, or commit the
connection file.

After onboarding, configure the host agent's `context_bridge` MCP connection
with the saved `mcpUrl` and bearer `apiKey`. Host-specific MCP configuration is
outside this portable skill; preserve the host's approval and secret-storage
flow.

LAN onboarding uses plain HTTP and is allowed only for a private IPv4 address
on a trusted home or office network. Prefer the public HTTPS endpoint on
untrusted networks and for normal ongoing access.

Report the profile name, workspace name, and saved connection-file path. Never
include the credential value in the report.
