---
name: context-bridge
description: Share or resume explicit Codex work context and related project artifacts across user-authorized accounts and devices. Use when the user asks to publish a checkpoint, resume shared work, invite a collaborator, or compare local files with a shared checkpoint.
---

# Context Bridge workflow

Treat the remote workspace as a user-controlled handoff record, not as a copy of
Codex's private conversation state.

## Publish a checkpoint

1. Call `whoami` and `list_workspaces`; never guess an account or workspace.
2. Inspect only the current project files that the user has placed in scope.
3. Build a concise checkpoint with:
   - current goal and status;
   - completed work;
   - decisions and their rationale;
   - blockers and next steps;
   - a file manifest containing relative paths and SHA-256 hashes.
4. Do not include secrets, credentials, `.env` values, private keys, access
   tokens, or files ignored by the project's ignore policy.
5. Attach file content only for small, necessary text artifacts. Prefer a Git
   commit/ref or an object-storage reference for repositories and large files.
6. Call `publish_checkpoint` once and report the returned checkpoint ID.

## Resume work

1. Call `whoami`, then `get_latest_checkpoint` for the requested workspace.
2. Summarize the goal, decisions, blockers, next steps, and file references.
3. Compare manifest hashes with local files when a local project is available.
4. Ask before overwriting a locally modified file. Preserve unrelated changes.
5. Continue from the recorded next step; do not claim access to messages or
   files that were never explicitly published.

## Share a workspace

1. Owners may call `create_invite` with the minimum necessary role.
2. Treat invite codes as secrets and mention their expiration.
3. The receiving account calls `join_workspace` after authenticating with its
   own Context Bridge identity.

## Permission model

- `owner`: manage members and invitations, read and write checkpoints.
- `editor`: read and write checkpoints.
- `viewer`: read checkpoints only.

Never bypass role checks or move data between workspaces implicitly.
