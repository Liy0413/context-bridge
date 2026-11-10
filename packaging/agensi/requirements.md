# Requirements and access

## Required service

The user must provide or be invited to a running Context Bridge service. Agensi
does not host that service. Normal publish, resume, and share workflows require
an authenticated MCP connection named `context_bridge` with the following
tools as applicable:

- `whoami`
- `list_workspaces`
- `create_workspace`
- `create_invite`
- `publish_checkpoint`
- `get_latest_checkpoint`
- `list_checkpoints`

If the connection or required tools are unavailable, stop and explain what is
missing. Never invent workspace, identity, invite, or checkpoint results.

## Joining a workspace

The join skill includes a self-contained Node.js script. It requires Node.js
20 or newer and network access to a service URL supplied by the user. The
script reads a one-time invitation from a masked prompt, saves the issued
credential to `connection.local.json`, and adds local Context Bridge state
files to `.gitignore`.

The user must then configure their agent's MCP connection using the saved URL
and bearer credential. Do not print or upload the credential.

## Security boundary

- Access only projects, services, and workspaces the user is authorized to use.
- Never publish API keys, invitation codes, `.env` values, private keys, or
  connection files.
- Ask before overwriting locally modified files.
- Trusted-LAN HTTP is only for a private home or office network. Use HTTPS on
  untrusted networks.
- The user operates and is responsible for the external Context Bridge service.
