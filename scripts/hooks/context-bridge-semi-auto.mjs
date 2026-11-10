#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_NAME = ".context-bridge.local.json";
const CONNECTION_NAME = "connection.local.json";
const STATE_NAME = ".context-bridge.state.json";
const CURRENT_SCRIPT_PATH = fileURLToPath(import.meta.url);
const TEXT_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".css", ".csv", ".go", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".json", ".jsx", ".md", ".mjs", ".py", ".rs",
  ".sh", ".sql", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".codex", ".cursor", ".git", ".hg", ".svn", ".tools", ".venv", "build", "dist",
  "node_modules", "vendor", "venv", "__pycache__",
]);
const EXCLUDED_NAMES = new Set([
  CONFIG_NAME,
  STATE_NAME,
  CONNECTION_NAME,
  "credentials.local.json",
]);

function jsonOutput(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function readJson(path, fallback = undefined) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function findProjectRoot(start) {
  let current = resolve(start);
  while (true) {
    for (const candidate of [CONFIG_NAME, CONNECTION_NAME]) {
      try {
        await stat(join(current, candidate));
        return current;
      } catch {}
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function loadProjectConfig(projectRoot) {
  try {
    return await readJson(join(projectRoot, CONFIG_NAME));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const connectionPath = join(projectRoot, CONNECTION_NAME);
  const connection = await readJson(connectionPath);
  if (!connection.mcpUrl || !connection.workspace?.id || !connection.apiKey) {
    throw new Error(`${CONNECTION_NAME} is incomplete`);
  }
  return {
    version: 1,
    mcpUrl: connection.mcpUrl,
    workspaceId: connection.workspace.id,
    workspaceName: connection.workspace.name ?? "Context Bridge workspace",
    credentialFile: connectionPath,
    credentialProfileId: null,
    identity: connection.profile ?? null,
  };
}

function extension(path) {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function isSecretLike(name) {
  const lower = name.toLowerCase();
  return (
    EXCLUDED_NAMES.has(lower) ||
    lower === ".env" ||
    lower.startsWith(".env.") ||
    lower.endsWith(".pem") ||
    lower.endsWith(".key") ||
    lower.includes("secret") ||
    lower.includes("credential")
  );
}

async function scanWorkspace(projectRoot) {
  const entries = [];
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (child.isSymbolicLink()) continue;
      const absolute = join(directory, child.name);
      const relativePath = relative(projectRoot, absolute).replaceAll("\\", "/");
      if (child.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(child.name.toLowerCase())) await visit(absolute);
        continue;
      }
      if (!child.isFile() || isSecretLike(child.name) || !TEXT_EXTENSIONS.has(extension(child.name))) continue;
      const info = await stat(absolute);
      if (info.size > 256 * 1024 || entries.length >= 2000) continue;
      const bytes = await readFile(absolute);
      entries.push({
        path: relativePath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
      });
    }
  }
  await visit(projectRoot);
  const digest = createHash("sha256");
  for (const entry of entries) digest.update(`${entry.path}\0${entry.sha256}\0${entry.size}\n`);
  return { hash: digest.digest("hex"), files: entries };
}

async function apiKeyFromConfig(config) {
  const credential = await readJson(config.credentialFile);
  if (typeof credential.apiKey === "string" && credential.apiKey) return credential.apiKey;
  if (Array.isArray(credential.profiles)) {
    const profile = credential.profiles.find((item) => item.id === config.credentialProfileId) ?? credential.profiles[0];
    if (typeof profile?.apiKey === "string" && profile.apiKey) return profile.apiKey;
  }
  throw new Error("The configured credential file does not contain a usable API key");
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

let requestCounter = 0;
let activeEventName = "";
async function callMcp(config, apiKey, name, args = {}) {
  const id = ++requestCounter;
  const response = await fetch(config.mcpUrl, {
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

function listPreview(paths, limit = 10) {
  if (paths.length === 0) return "无";
  const shown = paths.slice(0, limit).join("、");
  return paths.length > limit ? `${shown}（另有 ${paths.length - limit} 项）` : shown;
}

async function compareCheckpoint(projectRoot, checkpoint) {
  const matching = [];
  const missing = [];
  const modified = [];
  for (const file of checkpoint.files ?? []) {
    const absolute = resolve(projectRoot, file.path);
    const localRelative = relative(projectRoot, absolute);
    if (localRelative.startsWith("..") || isAbsolute(localRelative)) {
      modified.push(`${file.path}（路径不安全）`);
      continue;
    }
    try {
      const bytes = await readFile(absolute);
      const hash = createHash("sha256").update(bytes).digest("hex");
      (hash.toLowerCase() === String(file.sha256).toLowerCase() ? matching : modified).push(file.path);
    } catch (error) {
      if (error?.code === "ENOENT") missing.push(file.path);
      else modified.push(`${file.path}（无法读取）`);
    }
  }
  return { matching, missing, modified };
}

async function handleSessionStart(input, projectRoot, config, statePath, state) {
  const snapshot = await scanWorkspace(projectRoot);
  state.sessions ??= {};
  state.sessions[input.session_id ?? "unknown"] = {
    baselineHash: snapshot.hash,
    startedAt: new Date().toISOString(),
  };
  const sessionIds = Object.keys(state.sessions);
  for (const id of sessionIds.slice(0, Math.max(0, sessionIds.length - 20))) delete state.sessions[id];
  await writeJsonAtomic(statePath, state);

  const apiKey = await apiKeyFromConfig(config);
  let identity = config.identity;
  if (!identity?.id) {
    const identityResult = await callMcp(config, apiKey, "whoami");
    identity = identityResult.structuredContent?.profile;
  }
  if (!identity) throw new Error("Configured identity was not found");
  const latestResult = await callMcp(config, apiKey, "get_latest_checkpoint", { workspaceId: config.workspaceId });
  const checkpoint = latestResult.structuredContent?.checkpoint;
  if (!checkpoint || checkpoint.id === state.lastAppliedCheckpointId) {
    jsonOutput(input.hook_event_name === "sessionStart" ? {} : { continue: true });
    return;
  }

  const difference = await compareCheckpoint(projectRoot, checkpoint);
  const context = [
    `Context Bridge 在“${config.workspaceName}”发现尚未应用的检查点 #${checkpoint.sequence}《${checkpoint.title}》（${checkpoint.id}）。`,
    `当前身份：${identity.displayName}；发布者：${checkpoint.createdBy}。`,
    `文件比较：匹配 ${difference.matching.length}，本地缺失 ${difference.missing.length}，本地不同/冲突 ${difference.modified.length}。`,
    `缺失：${listPreview(difference.missing)}`,
    `冲突：${listPreview(difference.modified)}`,
    `摘要：${String(checkpoint.summary ?? "").slice(0, 1200)}`,
    `下一步：${(checkpoint.nextSteps ?? []).slice(0, 8).join("；") || "未记录"}`,
    "请先向用户展示以上差异，并明确询问是否应用。未经确认不得写文件；对本地不同文件必须逐项保留或合并，不得静默覆盖。",
    `成功应用并验证后运行：node ${JSON.stringify(CURRENT_SCRIPT_PATH)} mark-applied ${checkpoint.id}`,
  ].join("\n");
  if (input.hook_event_name === "sessionStart") {
    jsonOutput({ additional_context: context });
  } else {
    jsonOutput({
      continue: true,
      systemMessage: `Context Bridge：发现新检查点 #${checkpoint.sequence}，应用前需要确认。`,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    });
  }
}

async function handleStop(input, projectRoot, statePath, state) {
  const cursorProtocol = input.hook_event_name === "stop";
  if (input.stop_hook_active || (cursorProtocol && Number(input.loop_count ?? 0) > 0)) {
    jsonOutput(cursorProtocol ? {} : { continue: true });
    return;
  }
  const baseline = state.sessions?.[input.session_id ?? "unknown"]?.baselineHash;
  if (!baseline) {
    jsonOutput(cursorProtocol ? {} : { continue: true });
    return;
  }
  const snapshot = await scanWorkspace(projectRoot);
  if (snapshot.hash === baseline || state.lastPromptedSnapshotHash === snapshot.hash) {
    jsonOutput(cursorProtocol ? {} : { continue: true });
    return;
  }
  state.lastPromptedSnapshotHash = snapshot.hash;
  state.lastPromptedAt = new Date().toISOString();
  await writeJsonAtomic(statePath, state);
  const followup = [
    "Context Bridge 检测到本次会话修改了项目文件。",
    "请不要自动发布；只向用户询问一句：‘检测到本次工作有文件变化，是否将当前进度发布为 Context Bridge 检查点？’",
    "如果用户同意，再严格按照 context-bridge-publish Skill 整理增量检查点并排除所有凭据；如果用户拒绝或暂不发布，直接结束。",
  ].join(" ");
  jsonOutput(cursorProtocol ? { followup_message: followup } : { decision: "block", reason: followup });
}

async function main() {
  const command = process.argv[2];
  const rawInput = command === "mark-applied" ? "" : await readStdin();
  const input = rawInput ? JSON.parse(rawInput) : {};
  activeEventName = input.hook_event_name ?? "";
  const startDirectory = input.cwd
    ?? process.env.CURSOR_PROJECT_DIR
    ?? process.env.CLAUDE_PROJECT_DIR
    ?? process.cwd();
  const projectRoot = await findProjectRoot(startDirectory);
  if (!projectRoot) {
    jsonOutput(input.hook_event_name === "sessionStart" || input.hook_event_name === "stop" ? {} : { continue: true });
    return;
  }
  const statePath = join(projectRoot, STATE_NAME);
  const config = await loadProjectConfig(projectRoot);
  const state = await readJson(statePath, { version: 1, sessions: {} });

  if (command === "mark-applied") {
    const checkpointId = process.argv[3];
    if (!checkpointId?.startsWith("cp_")) throw new Error("A valid checkpoint ID is required");
    state.lastAppliedCheckpointId = checkpointId;
    state.lastAppliedAt = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    process.stdout.write(`Marked ${checkpointId} as applied.\n`);
    return;
  }

  if (input.hook_event_name === "SessionStart" || input.hook_event_name === "sessionStart") {
    await handleSessionStart(input, projectRoot, config, statePath, state);
  } else if (input.hook_event_name === "Stop" || input.hook_event_name === "stop") {
    await handleStop(input, projectRoot, statePath, state);
  } else {
    jsonOutput({ continue: true });
  }
}

main().catch((error) => {
  if (activeEventName === "sessionStart" || activeEventName === "stop") {
    process.stderr.write(`Context Bridge hook failed open: ${error instanceof Error ? error.message : "unknown error"}\n`);
    jsonOutput({});
    return;
  }
  jsonOutput({
    continue: true,
    systemMessage: `Context Bridge 半自动同步检查失败（已放行）：${error instanceof Error ? error.message : "未知错误"}`,
  });
});
