# Portable Agent Skills · 0.2.0

Codex and Cursor users install the complete plugin through console option
`[14]`, then link their project with `[12]`; see [INSTALL.md](INSTALL.md).
The standalone installer below supplies the four skills for other supported
agents. It does not install lifecycle hooks. The Agensi Skill Pack uses the
same four skills; see [AGENSI.md](AGENSI.md).

Context Bridge keeps one central MCP service and distributes its repeatable
workflows as portable Agent Skills. A Skill teaches an agent when and how to use
the service; it does not replace the service, authentication, or workspace data.

## Included skills

- `context-bridge-join`: onboard a new account or device through HTTPS or
  trusted-LAN discovery.
- `context-bridge-publish`: publish an explicit checkpoint and safe file
  manifest.
- `context-bridge-resume`: inspect a checkpoint, compare local files, and
  continue without overwriting local work silently.
- `context-bridge-share`: create workspaces and minimum-role, expiring invites.

Each Skill is independently installable. The join Skill includes a Node.js 20+
helper under its own `scripts/` directory so the installed Skill remains
self-contained.

## Local installer

List supported agents and skills:

```powershell
node .\scripts\install-agent-skills.mjs --list
```

Preview an installation before writing anything:

```powershell
node .\scripts\install-agent-skills.mjs `
  --agent cursor `
  --scope project `
  --project-path C:\path\to\target-project `
  --dry-run
```

Install all four Skills after reviewing the plan:

```powershell
node .\scripts\install-agent-skills.mjs `
  --agent cursor `
  --scope project `
  --project-path C:\path\to\target-project
```

Supported agent names and destinations:

- `codex`: project `.agents/skills`, user `~/.agents/skills`;
- `claude-code`: project `.claude/skills`, user `~/.claude/skills`;
- `cursor`: project `.cursor/skills`, user `~/.cursor/skills`;
- `github-copilot`: project `.github/skills`, user `~/.copilot/skills`;
- `all`: install to all four destinations.

For another agent that supports `SKILL.md`, pass its documented Skill root
directly without changing this repository:

```powershell
node .\scripts\install-agent-skills.mjs `
  --target-dir C:\path\from\that-agent's-documentation\skills
```

`--target-dir` is repeatable and can be combined with `--agent`. This provides a
local fallback for additional agents without claiming an unverified directory
layout. Check the target agent's current official documentation before choosing
that directory.

Use `--skill context-bridge-join` to install only one Skill. Repeat `--skill`
or pass comma-separated names to select more than one. Existing target folders
cause the installer to stop before copying anything. Use `--force` only after
reviewing the existing installation and intentionally choosing replacement.

## Configure the MCP connection separately

The installer deliberately does not edit an agent's MCP settings. Configure the
same `context_bridge` Streamable HTTP endpoint for every device, using the
public HTTPS URL from `mcp.json` or the trusted-LAN URL produced during local
onboarding. Store the personal bearer API key in the agent's supported secret
storage; never put it in a Skill, repository, command line, or shared prompt.

After configuration, start a new agent session so it discovers the installed
Skills and MCP tools. Test in this order:

1. `context-bridge-join` on the new device;
2. `whoami` and `list_workspaces` through the MCP connection;
3. `context-bridge-publish` on one device;
4. `context-bridge-resume` on another device.

## Security boundary

Skills are instructions and executable helpers inside the local agent trust
boundary. Review them before installation. The join helper never accepts an
invite code as a command-line argument, masks interactive input, does not print
the issued API key, and refuses to overwrite an existing connection file unless
`--force` is explicit.

Only use LAN onboarding on a trusted private network. Public or untrusted
networks must use the HTTPS endpoint.
