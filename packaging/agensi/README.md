# Context Bridge Workspace Handoff Pack

Four portable agent skills for sharing explicit project checkpoints across
authorized accounts and devices through a user-operated Context Bridge MCP
service.

Included skills:

- `context-bridge-join`: join a workspace with a one-time invitation;
- `context-bridge-publish`: publish a deliberate project checkpoint;
- `context-bridge-resume`: inspect differences and resume from a checkpoint;
- `context-bridge-share`: create workspaces and role-limited invitations.

Read `requirements.md` before using the pack. Context Bridge shares only data
that a user explicitly publishes. It does not expose private chats, hidden
instructions, model state, credentials, or arbitrary files from another
device.

This Agensi package contains skills only. Agensi does not install the Context
Bridge plugin, lifecycle hooks, or MCP server configuration.
