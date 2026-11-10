#!/usr/bin/env node

import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const skillsRoot = join(repositoryRoot, "skills");
const availableSkills = [
  "context-bridge-join",
  "context-bridge-publish",
  "context-bridge-resume",
  "context-bridge-share",
];

const agents = {
  codex: {
    project: [".agents", "skills"],
    user: [homedir(), ".agents", "skills"],
  },
  "claude-code": {
    project: [".claude", "skills"],
    user: [homedir(), ".claude", "skills"],
  },
  cursor: {
    project: [".cursor", "skills"],
    user: [homedir(), ".cursor", "skills"],
  },
  "github-copilot": {
    project: [".github", "skills"],
    user: [homedir(), ".copilot", "skills"],
  },
};

function usage() {
  console.log(`Install Context Bridge Agent Skills locally

Usage:
  node scripts/install-agent-skills.mjs [--agent <name>] [--target-dir <path>] [options]

Agents:
  codex | claude-code | cursor | github-copilot | all

Options:
  --scope <project|user>      Installation scope (default: project)
  --project-path <path>       Project root for project scope (default: cwd)
  --target-dir <path>         Additional/custom Agent Skills root (repeatable)
  --skill <name[,name...]>    Install selected skills (default: all four)
  --dry-run                   Show the plan without writing files
  --force                     Replace existing target skill directories
  --list                      List available skills and agents
  --help                      Show this help

This installer copies Skill folders only. It does not configure MCP, transmit
credentials, contact GitHub, or publish the repository.`);
}

function parseArguments(argv) {
  const options = {
    scope: "project",
    projectPath: process.cwd(),
    selectedSkills: [],
    targetDirectories: [],
    dryRun: false,
    force: false,
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
      case "--agent": options.agent = takeValue(); break;
      case "--scope": options.scope = takeValue(); break;
      case "--project-path": options.projectPath = takeValue(); break;
      case "--target-dir": options.targetDirectories.push(takeValue()); break;
      case "--skill": options.selectedSkills.push(...takeValue().split(",").filter(Boolean)); break;
      case "--dry-run": options.dryRun = true; break;
      case "--force": options.force = true; break;
      case "--list": options.list = true; break;
      case "--help": options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (options.help || options.list) return options;
  if (options.agent && options.agent !== "all" && !agents[options.agent]) {
    throw new Error("--agent must be codex, claude-code, cursor, github-copilot, or all");
  }
  if (!options.agent && options.targetDirectories.length === 0) {
    throw new Error("Provide --agent, --target-dir, or both");
  }
  if (!['project', 'user'].includes(options.scope)) {
    throw new Error("--scope must be project or user");
  }
  if (options.selectedSkills.length === 0) options.selectedSkills = [...availableSkills];
  options.selectedSkills = [...new Set(options.selectedSkills)];
  const unknownSkills = options.selectedSkills.filter((skill) => !availableSkills.includes(skill));
  if (unknownSkills.length > 0) throw new Error(`Unknown skill: ${unknownSkills.join(", ")}`);
  return options;
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function validateSourceSkill(skillName) {
  const skillDirectory = join(skillsRoot, skillName);
  const manifestPath = join(skillDirectory, "SKILL.md");
  const manifest = await readFile(manifestPath, "utf8");
  const frontmatter = manifest.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatter || !new RegExp(`^name:\\s*${skillName}\\s*$`, "m").test(frontmatter[1])) {
    throw new Error(`${manifestPath} has invalid or mismatched frontmatter`);
  }
  return skillDirectory;
}

function targetRoot(agentName, scope, projectPath) {
  const segments = agents[agentName][scope];
  return scope === "project"
    ? join(resolve(projectPath), ...segments)
    : join(...segments);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.list) {
    console.log(`Agents: ${Object.keys(agents).join(", ")}`);
    console.log(`Skills: ${availableSkills.join(", ")}`);
    return;
  }

  const selectedAgents = options.agent === "all"
    ? Object.keys(agents)
    : options.agent ? [options.agent] : [];
  const sourceDirectories = new Map();
  for (const skillName of options.selectedSkills) {
    sourceDirectories.set(skillName, await validateSourceSkill(skillName));
  }

  const plan = [];
  for (const agentName of selectedAgents) {
    const root = targetRoot(agentName, options.scope, options.projectPath);
    for (const skillName of options.selectedSkills) {
      plan.push({
        agentName,
        skillName,
        source: sourceDirectories.get(skillName),
        destination: join(root, skillName),
      });
    }
  }
  for (const directory of options.targetDirectories) {
    const root = resolve(directory);
    for (const skillName of options.selectedSkills) {
      plan.push({
        agentName: `custom (${root})`,
        skillName,
        source: sourceDirectories.get(skillName),
        destination: join(root, skillName),
      });
    }
  }

  if (!options.force) {
    const conflicts = [];
    for (const item of plan) {
      if (await exists(item.destination)) conflicts.push(item.destination);
    }
    if (conflicts.length > 0) {
      throw new Error(`Target skills already exist:\n${conflicts.join("\n")}\nRe-run with --force only if replacement is intended.`);
    }
  }

  for (const item of plan) {
    console.log(`${options.dryRun ? "Would install" : "Installing"} ${item.skillName} for ${item.agentName} -> ${item.destination}`);
    if (options.dryRun) continue;
    await mkdir(dirname(item.destination), { recursive: true });
    if (options.force && await exists(item.destination)) {
      await rm(item.destination, { recursive: true, force: true });
    }
    await cp(item.source, item.destination, { recursive: true, force: false, errorOnExist: true });
  }

  if (!options.dryRun) {
    console.log(`Installed ${plan.length} skill copy/copies across ${selectedAgents.length + options.targetDirectories.length} target(s).`);
    console.log("MCP configuration and credentials were not changed.");
  }
}

main().catch((error) => {
  console.error(`Skill installation failed: ${error.message}`);
  process.exitCode = 1;
});
