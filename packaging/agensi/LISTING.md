# Agensi listing draft

This file is for the creator dashboard and is intentionally excluded from the
uploaded ZIP.

## Listing

- **Name:** Context Bridge Workspace Handoff Pack
- **Version:** 0.2.0
- **Category:** Agents & Orchestration
- **Suggested launch price:** Free while the service and onboarding flow are in
  development
- **Documentation:** https://github.com/Liy0413/context-bridge#readme

## Summary

Share explicit project checkpoints, decisions, next steps, and selected files
across authorized AI-agent accounts and devices using your own Context Bridge
MCP service.

## Tags

`collaboration`, `agent-workflows`, `context-handoff`, `mcp`, `cross-device`,
`project-continuity`, `developer-tools`

## Keywords

`context bridge`, `checkpoint`, `handoff`, `workspace`, `resume work`,
`multi-device`, `multi-account`, `agent collaboration`, `MCP`, `sync`

## Use cases

1. Hand off an unfinished coding project to another authorized device.
2. Resume from an explicit checkpoint without exporting a private chat.
3. Compare checkpoint file hashes before applying shared artifacts.
4. Invite an editor or viewer with a one-time, expiring code.
5. Publish decisions, blockers, and next steps for another agent session.
6. Onboard a trusted device over public HTTPS or a private LAN.

## Needs access to

- A user-operated Context Bridge service
- An authenticated `context_bridge` MCP connection for normal workflows
- Node.js 20+ and network access for the optional workspace-join script

## Permissions to declare

- Terminal / Shell
- Read Files
- Write Files
- Network Access

Allowed hosts depend on the service URL supplied by the buyer. Do not declare
Agensi as the host of the Context Bridge service.

## Important limitation

Agensi delivers this listing as a Skill Pack through MCP. It does not install
the Context Bridge desktop plugin, lifecycle hooks, or MCP settings. Do not
claim that the Agensi listing provides automatic background synchronization.
