---
name: context-bridge-share
description: Create and manage a Context Bridge workspace or one-time invitation for another authorized account or device. Use when the user asks to create a workspace, invite someone, choose a role, or generate a new invite. Do not use for joining with an invite.
---

# Share a Context Bridge workspace

Requires: an authenticated `context_bridge` MCP connection. When
`requirements.md` is available in the skill pack, read it before managing a
workspace. If the connection or required tools are unavailable, stop and
explain what is missing rather than inventing results.

Use the authenticated `context_bridge` MCP connection. Never substitute a
locally isolated store for the existing central service.

## Create a workspace

1. Call `whoami` so the user knows which profile will own the workspace.
2. Call `create_workspace` with the requested name.
3. Report the workspace name and ID without exposing authentication material.

## Create an invitation

1. Call `list_workspaces` and confirm the intended workspace. Only an `owner`
   may create an invite.
2. Choose the minimum role that satisfies the request:
   - `viewer` reads checkpoints;
   - `editor` reads and publishes checkpoints.
3. Use the requested expiry, or 24 hours when the user did not specify one.
4. Call `create_invite` once. Treat the returned code as a one-time secret.
5. Give the code only to the user who requested it, state its role and expiry,
   and warn that it becomes unusable after one successful onboarding.

Never share the owner's API key. Do not put invite codes in Git, logs, URLs, or
command-line arguments. Creating an invite authorizes only the specified
workspace and role; it does not grant access to private chats or unpublished
files.
