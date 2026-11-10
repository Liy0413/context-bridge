---
name: context-bridge-resume
description: Resume work from a Context Bridge checkpoint on another authorized account or device. Use when the user asks to restore, continue, inspect, or compare previously shared work. Do not use for restoring private chats or unpublished files.
---

# Resume from Context Bridge

Requires: an authenticated `context_bridge` MCP connection. When
`requirements.md` is available in the skill pack, read it before resuming. If
the connection or required tools are unavailable, stop and explain what is
missing rather than inventing results.

1. Call `whoami` and `list_workspaces`; confirm the intended workspace when
   more than one is available.
2. Call `get_latest_checkpoint`, or `list_checkpoints` when the user requests a
   particular handoff rather than the newest one.
3. Summarize the shared goal, status, decisions, blockers, next steps, source
   reference, and file manifest before changing local files.
4. When a local project is present, compare manifest SHA-256 values with local
   files. Distinguish missing, matching, locally modified, and remote-only
   files.
5. Ask before overwriting a locally modified file. Preserve unrelated changes,
   and prefer Git retrieval when the checkpoint provides a repository ref.
6. Continue from the recorded next step only after required project files are
   available or the user accepts a partial resume.

State clearly that Context Bridge restores only explicitly published data. It
does not provide access to another account's private chat, hidden instructions,
model state, or arbitrary device files.
