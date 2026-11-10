---
name: context-bridge-publish
description: Publish an explicit Context Bridge checkpoint for the current project so another authorized account or device can continue. Use when the user asks to save, sync, hand off, or share current work progress. Do not use for generic Git commits or hidden conversation export.
---

# Publish a Context Bridge checkpoint

Requires: an authenticated `context_bridge` MCP connection. When
`requirements.md` is available in the skill pack, read it before publishing.
If the connection or required tools are unavailable, stop and explain what is
missing rather than inventing results.

Treat the workspace as a user-controlled handoff record, not a copy of an
agent's private conversation state.

1. Call `whoami` and `list_workspaces`. Never guess the identity or workspace.
2. Inspect only project files the user placed in scope. Preserve unrelated and
   uncommitted changes.
3. Prepare a concise checkpoint containing the goal and current status,
   completed work, decisions and rationale, blockers, and concrete next steps.
4. Build a manifest with relative paths, SHA-256 hashes, byte sizes, and file
   status. Exclude ignored files and anything outside the project scope.
5. Never publish credentials, `.env` values, private keys, tokens, invite
   codes, connection files, or other secrets.
6. Include inline content only for small text files needed for the handoff.
   Prefer a Git repository, commit, branch, or object-storage reference for a
   complete project or large artifacts.
7. Call `publish_checkpoint` once after the payload is ready. Report its ID,
   sequence, workspace, file count, and any intentionally omitted content.

Do not claim that unpublished messages, hidden prompts, model state, or files
have been synchronized.
