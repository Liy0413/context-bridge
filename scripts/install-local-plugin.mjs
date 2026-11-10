#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(scriptDirectory, "..");

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") { options.help = true; continue; }
    if (argument !== "--target") throw new Error(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error("--target requires a path");
    options.target = value;
    index += 1;
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/install-local-plugin.mjs [--target <directory>]");
    return;
  }
  const targetRoot = resolve(options.target ?? join(homedir(), ".cursor", "plugins", "local", "context-bridge"));
  await mkdir(targetRoot, { recursive: true });

  const files = ["plugin.json", "mcp.json", "LICENSE", "README.md"];
  const directories = [".cursor-plugin", ".codex-plugin", "hooks", "skills", join("scripts", "hooks")];
  for (const file of files) {
    await cp(join(sourceRoot, file), join(targetRoot, file), { force: true });
  }
  for (const directory of directories) {
    await cp(join(sourceRoot, directory), join(targetRoot, directory), { recursive: true, force: true });
  }

  console.log(`Installed Cursor-compatible local Context Bridge package: ${targetRoot}`);
  console.log("Only distributable manifests, skills, hooks, and public documentation were copied.");
  console.log("For Codex, install the repository through its local marketplace; the terminal console automates both routes.");
}

main().catch((error) => {
  console.error(`Local plugin installation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
