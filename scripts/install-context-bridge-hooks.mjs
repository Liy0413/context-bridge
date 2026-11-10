#!/usr/bin/env node

import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const hookSource = join(scriptDirectory, "hooks", "context-bridge-semi-auto.mjs");
const codexHookCommand = "node .codex/hooks/context-bridge-semi-auto.mjs";
const cursorHookCommand = "node .cursor/hooks/context-bridge-semi-auto.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help") { options.help = true; continue; }
    if (key === "--link-only") { options.linkOnly = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function usage() {
  console.log(`Install Context Bridge semi-automatic project hooks

Usage:
  node scripts/install-context-bridge-hooks.mjs \\
    --project <path> --mcp-url <url> --workspace-name <name> \\
    --credential-file <path> [--credential-profile-id <id>] [--link-only]

The credential remains in its existing ignored local file. The project marker
stores only its absolute path, never the API key.`);
}

async function readJson(path, fallback = undefined) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function getApiKey(credentialFile, profileId) {
  const credential = await readJson(credentialFile);
  if (typeof credential.apiKey === "string" && credential.apiKey) return credential.apiKey;
  const profile = credential.profiles?.find((item) => item.id === profileId) ?? credential.profiles?.[0];
  if (typeof profile?.apiKey === "string" && profile.apiKey) return profile.apiKey;
  throw new Error("Credential file does not contain a usable API key");
}

function parseMcpResponse(contentType, text, requestId) {
  if (contentType.includes("application/json")) {
    const message = JSON.parse(text);
    if (message.error) throw new Error(message.error.message ?? "MCP request failed");
    return message.result;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const message = JSON.parse(line.slice(5).trim());
    if (message.id !== requestId) continue;
    if (message.error) throw new Error(message.error.message ?? "MCP request failed");
    return message.result;
  }
  throw new Error("MCP server returned no matching response");
}

async function callMcp(mcpUrl, apiKey, name, args = {}, id = 1) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  return parseMcpResponse(response.headers.get("content-type") ?? "", text, id);
}

function removeExistingCodexHandler(groups = []) {
  return groups
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter((hook) => hook.command !== codexHookCommand),
    }))
    .filter((group) => group.hooks.length > 0);
}

function removeExistingCursorHandler(handlers = []) {
  return handlers.filter((handler) => handler.command !== cursorHookCommand);
}

async function appendIgnore(projectRoot, entries) {
  const path = join(projectRoot, ".gitignore");
  let current = "";
  try { current = await readFile(path, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const lines = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = entries.filter((entry) => !lines.has(entry));
  if (missing.length === 0) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  await writeFile(path, `${current}${prefix}${missing.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { usage(); return; }
  for (const required of ["project", "mcp-url", "workspace-name", "credential-file"]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }

  const projectRoot = resolve(options.project);
  const credentialFile = resolve(options["credential-file"]);
  await stat(projectRoot);
  await stat(credentialFile);
  const mcpUrl = new URL(options["mcp-url"]);
  if (!mcpUrl.pathname.endsWith("/mcp") || !["http:", "https:"].includes(mcpUrl.protocol)) {
    throw new Error("--mcp-url must be an HTTP(S) URL ending in /mcp");
  }

  const apiKey = await getApiKey(credentialFile, options["credential-profile-id"]);
  const identityResult = await callMcp(mcpUrl.toString(), apiKey, "whoami", {}, 1);
  const workspacesResult = await callMcp(mcpUrl.toString(), apiKey, "list_workspaces", {}, 2);
  const identity = identityResult.structuredContent?.profile;
  const workspace = workspacesResult.structuredContent?.workspaces?.find((item) => item.name === options["workspace-name"]);
  if (!identity || !workspace) throw new Error("Identity or requested workspace was not found");

  if (!options.linkOnly) {
    const codexDirectory = join(projectRoot, ".codex");
    const codexHookDirectory = join(codexDirectory, "hooks");
    const codexHooksPath = join(codexDirectory, "hooks.json");
    await mkdir(codexHookDirectory, { recursive: true });
    await cp(hookSource, join(codexHookDirectory, "context-bridge-semi-auto.mjs"), { force: true });

    const codexHooks = await readJson(codexHooksPath, { version: 1, hooks: {} });
    codexHooks.version = 1;
    codexHooks.hooks ??= {};
    codexHooks.hooks.SessionStart = removeExistingCodexHandler(codexHooks.hooks.SessionStart);
    codexHooks.hooks.Stop = removeExistingCodexHandler(codexHooks.hooks.Stop);
    codexHooks.hooks.SessionStart.push({
      matcher: "startup|resume|clear|compact|fork",
      hooks: [{
        type: "command",
        command: codexHookCommand,
        timeout: 30,
        additionalContextLimit: 2000,
        statusMessage: "正在检查 Context Bridge 最新检查点…",
      }],
    });
    codexHooks.hooks.Stop.push({
      hooks: [{ type: "command", command: codexHookCommand, timeout: 30 }],
    });
    await writeFile(codexHooksPath, `${JSON.stringify(codexHooks, null, 2)}\n`, "utf8");

    const cursorDirectory = join(projectRoot, ".cursor");
    const cursorHookDirectory = join(cursorDirectory, "hooks");
    const cursorHooksPath = join(cursorDirectory, "hooks.json");
    await mkdir(cursorHookDirectory, { recursive: true });
    await cp(hookSource, join(cursorHookDirectory, "context-bridge-semi-auto.mjs"), { force: true });

    const cursorHooks = await readJson(cursorHooksPath, { version: 1, hooks: {} });
    cursorHooks.version = 1;
    cursorHooks.hooks ??= {};
    cursorHooks.hooks.sessionStart = removeExistingCursorHandler(cursorHooks.hooks.sessionStart);
    cursorHooks.hooks.stop = removeExistingCursorHandler(cursorHooks.hooks.stop);
    cursorHooks.hooks.sessionStart.push({
      type: "command",
      command: cursorHookCommand,
      timeout: 30,
    });
    cursorHooks.hooks.stop.push({
      type: "command",
      command: cursorHookCommand,
      timeout: 30,
      loop_limit: 1,
    });
    await writeFile(cursorHooksPath, `${JSON.stringify(cursorHooks, null, 2)}\n`, "utf8");
  }

  const marker = {
    version: 1,
    mcpUrl: mcpUrl.toString().replace(/\/$/, ""),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    identity: { id: identity.id, displayName: identity.displayName },
    credentialFile,
    credentialProfileId: options["credential-profile-id"] ?? null,
    installedFrom: repositoryRoot,
  };
  await writeFile(join(projectRoot, ".context-bridge.local.json"), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  await appendIgnore(projectRoot, [".context-bridge.local.json", ".context-bridge.state.json"]);

  console.log(options.linkOnly
    ? `Linked project to Context Bridge plugin hooks: ${projectRoot}`
    : `Installed standalone Context Bridge hooks for .cursor and .codex in: ${projectRoot}`);
  console.log(`Identity: ${identity.displayName} (${identity.id})`);
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);
  console.log("No API key was copied or printed.");
  if (options.linkOnly) console.log("The installed Context Bridge plugin supplies the hooks; no project hook files were added.");
  else console.log("Open the project and review/trust the standalone hooks with /hooks.");
}

main().catch((error) => {
  console.error(`Hook installation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
