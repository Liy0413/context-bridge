#!/usr/bin/env node

import { createSocket } from "node:dgram";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DISCOVERY_REQUEST = "CONTEXT_BRIDGE_DISCOVER_V1";
const DISCOVERY_PROTOCOL = "context-bridge-lan-v1";

function usage() {
  console.log(`Context Bridge onboarding

Usage:
  node join-workspace.mjs --service-url https://bridge.example.com [options]
  node join-workspace.mjs --discover-lan [options]

Options:
  --display-name <name>       Device or profile name
  --service-id <id>           Select one LAN service when multiple exist
  --discovery-port <port>     UDP discovery port (default: 8788)
  --timeout <seconds>         LAN discovery timeout (default: 4)
  --output <path>             Connection file (default: ./connection.local.json)
  --allow-private-http        Permit an explicit private IPv4 HTTP URL
  --force                     Replace an existing output file
  --help                      Show this help

The invite is read from a masked prompt or CONTEXT_BRIDGE_INVITE_CODE. Never
put an invite or API key in a command-line argument.`);
}

function parseArguments(argv) {
  const options = {
    discoverLan: false,
    force: false,
    allowPrivateHttp: false,
    discoveryPort: 8788,
    timeoutSeconds: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case "--service-url": options.serviceUrl = takeValue(); break;
      case "--display-name": options.displayName = takeValue(); break;
      case "--service-id": options.serviceId = takeValue(); break;
      case "--discovery-port": options.discoveryPort = Number(takeValue()); break;
      case "--timeout": options.timeoutSeconds = Number(takeValue()); break;
      case "--output": options.output = takeValue(); break;
      case "--discover-lan": options.discoverLan = true; break;
      case "--allow-private-http": options.allowPrivateHttp = true; break;
      case "--force": options.force = true; break;
      case "--help": options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!Number.isInteger(options.discoveryPort) || options.discoveryPort < 1 || options.discoveryPort > 65535) {
    throw new Error("--discovery-port must be an integer between 1 and 65535");
  }
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds < 1 || options.timeoutSeconds > 30) {
    throw new Error("--timeout must be between 1 and 30 seconds");
  }
  if (options.discoverLan && options.serviceUrl) {
    throw new Error("Use either --discover-lan or --service-url, not both");
  }
  return options;
}

function isPrivateIPv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 169 && parts[1] === 254)
    || parts[0] === 127;
}

function normalizeServiceUrl(input, allowPrivateHttp) {
  const url = new URL(input);
  url.pathname = url.pathname.replace(/\/mcp\/?$/, "").replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  const privateHttp = url.protocol === "http:" && isPrivateIPv4(url.hostname);
  if (url.protocol !== "https:" && !(allowPrivateHttp && privateHttp)) {
    throw new Error("Use HTTPS, or explicitly allow HTTP for a trusted private IPv4 address");
  }
  return url.toString().replace(/\/$/, "");
}

async function discoverLan(options) {
  const socket = createSocket("udp4");
  const found = new Map();
  await new Promise((resolveBind, rejectBind) => {
    socket.once("error", rejectBind);
    socket.bind(0, "0.0.0.0", () => {
      socket.removeListener("error", rejectBind);
      resolveBind();
    });
  });
  socket.setBroadcast(true);
  socket.on("message", (message, remote) => {
    try {
      const advertisement = JSON.parse(message.toString("utf8"));
      if (advertisement.protocol !== DISCOVERY_PROTOCOL || advertisement.service !== "context-bridge") return;
      if (options.serviceId && advertisement.serviceId !== options.serviceId) return;
      if (!isPrivateIPv4(remote.address)) return;
      const httpPort = Number(advertisement.httpPort);
      if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) return;
      found.set(`${remote.address}:${httpPort}`, {
        serviceId: String(advertisement.serviceId),
        address: remote.address,
        httpPort,
      });
    } catch {
      // Ignore unrelated or malformed UDP traffic.
    }
  });
  const request = Buffer.from(DISCOVERY_REQUEST, "utf8");
  await new Promise((resolveSend, rejectSend) => {
    socket.send(request, options.discoveryPort, "255.255.255.255", (error) => {
      if (error) rejectSend(error); else resolveSend();
    });
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, options.timeoutSeconds * 1000));
  socket.close();

  const services = [...found.values()];
  if (services.length === 0) {
    throw new Error("No Context Bridge service was discovered. Check the LAN, discovery setting, and firewall.");
  }
  if (services.length > 1) {
    const summary = services.map((service) => `${service.serviceId} at ${service.address}:${service.httpPort}`).join("; ");
    throw new Error(`Multiple services were found: ${summary}. Re-run with --service-id.`);
  }
  const service = services[0];
  return {
    serviceUrl: `http://${service.address}:${service.httpPort}`,
    expectedServiceId: service.serviceId,
  };
}

async function promptText(label) {
  if (!stdin.isTTY) throw new Error(`${label} is required in a non-interactive session`);
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    return (await reader.question(`${label}: `)).trim();
  } finally {
    reader.close();
  }
}

async function promptHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Set CONTEXT_BRIDGE_INVITE_CODE for a non-interactive session");
  }
  stdout.write(`${label}: `);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolvePrompt, rejectPrompt) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          rejectPrompt(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolvePrompt(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        value += character;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error ? `: ${body.error}` : "";
    throw new Error(`Context Bridge returned HTTP ${response.status}${reason}`);
  }
  return body;
}

async function ensureLocalFilesIgnored(directory) {
  const ignorePath = resolve(directory, ".gitignore");
  let current = "";
  try { current = await readFile(ignorePath, "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const required = ["connection.local.json", ".context-bridge.local.json", ".context-bridge.state.json"];
  const missing = required.filter((entry) => !existing.has(entry));
  if (missing.length === 0) return;
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  await writeFile(ignorePath, `${current}${separator}${missing.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  let serviceUrl = options.serviceUrl || process.env.CONTEXT_BRIDGE_URL;
  let expectedServiceId;
  let allowPrivateHttp = options.allowPrivateHttp;
  if (options.discoverLan) {
    const discovered = await discoverLan(options);
    serviceUrl = discovered.serviceUrl;
    expectedServiceId = discovered.expectedServiceId;
    allowPrivateHttp = true;
  }
  if (!serviceUrl) serviceUrl = await promptText("Context Bridge service URL");
  serviceUrl = normalizeServiceUrl(serviceUrl, allowPrivateHttp);

  const outputPath = resolve(options.output || "connection.local.json");
  if (await pathExists(outputPath) && !options.force) {
    throw new Error(`${outputPath} already exists; use --force only if replacing it is intended`);
  }

  const health = await requestJson(`${serviceUrl}/health`, { method: "GET" });
  if (!health.ok || health.service !== "context-bridge") throw new Error("Service identity verification failed");
  if (expectedServiceId && health.serviceId !== expectedServiceId) throw new Error("Discovered service ID changed");

  const displayName = options.displayName || await promptText("Device or profile name");
  if (!displayName || displayName.length > 100) throw new Error("Display name must contain 1 to 100 characters");
  const inviteCode = process.env.CONTEXT_BRIDGE_INVITE_CODE || await promptHidden("One-time invite code");
  if (inviteCode.length < 20 || inviteCode.length > 128) throw new Error("Invite code length is invalid");

  const joined = await requestJson(`${serviceUrl}/onboarding/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteCode, displayName }),
  });
  const connection = {
    serviceUrl,
    mcpUrl: `${serviceUrl}/mcp`,
    profile: joined.profile,
    workspace: { id: joined.workspace.id, name: joined.workspace.name },
    apiKey: joined.apiKey,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(connection, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (options.force && await pathExists(outputPath)) await rm(outputPath, { force: true });
  await rename(temporaryPath, outputPath);
  await ensureLocalFilesIgnored(dirname(outputPath));

  console.log(`Joined workspace '${joined.workspace.name}' as '${joined.profile.displayName}'.`);
  console.log(`Connection credential saved to: ${outputPath}`);
  console.log("The invite and API key were not printed. Do not commit or share the connection file.");
}

main().catch((error) => {
  console.error(`Context Bridge onboarding failed: ${error.message}`);
  process.exitCode = 1;
});
