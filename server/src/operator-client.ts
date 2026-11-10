import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type CliOptions = {
  url: string;
  keyEnv: string;
  action: "whoami" | "list-workspaces" | "create-workspace" | "create-invite" | "publish-checkpoint" | "get-latest-checkpoint" | "list-checkpoints";
  outputEncoding: "json" | "base64";
  name?: string;
  workspaceId?: string;
  role?: "editor" | "viewer";
  expiresInHours?: number;
  title?: string;
  summary?: string;
  nextStep?: string;
  limit?: number;
};

function usage(): string {
  return [
    "Context Bridge operator MCP client",
    "",
    "Usage:",
    "  node operator-client.js --url <mcp-url> --key-env <name> --action <action> [options]",
    "",
    "Actions:",
    "  whoami",
    "  list-workspaces",
    "  create-workspace --name <name>",
    "  create-invite --workspace-id <id> --role <editor|viewer> --expires-in-hours <1-168>",
    "  publish-checkpoint --workspace-id <id> --title <title> --summary <summary> [--next-step <text>]",
    "  get-latest-checkpoint --workspace-id <id>",
    "  list-checkpoints --workspace-id <id> [--limit <1-100>]",
    "",
    "Options:",
    "  --output-encoding <json|base64>  Encode UTF-8 JSON as Base64 for legacy shells",
    "",
    "The API key is read only from the named environment variable.",
  ].join("\n");
}

function parseArguments(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }

  const url = values.get("--url");
  const keyEnv = values.get("--key-env");
  const action = values.get("--action") as CliOptions["action"] | undefined;
  if (!url || !keyEnv || !action) throw new Error("--url, --key-env, and --action are required");
  if (!(["whoami", "list-workspaces", "create-workspace", "create-invite", "publish-checkpoint", "get-latest-checkpoint", "list-checkpoints"] as string[]).includes(action)) {
    throw new Error(`Unsupported action: ${action}`);
  }

  const parsedUrl = new URL(url);
  if (!(["http:", "https:"] as string[]).includes(parsedUrl.protocol) || !parsedUrl.pathname.endsWith("/mcp")) {
    throw new Error("--url must be an HTTP(S) MCP endpoint ending in /mcp");
  }

  const options: CliOptions = {
    url: parsedUrl.toString(),
    keyEnv,
    action,
    outputEncoding: (values.get("--output-encoding") ?? "json") as CliOptions["outputEncoding"],
    name: values.get("--name"),
    workspaceId: values.get("--workspace-id"),
    role: values.get("--role") as CliOptions["role"] | undefined,
    title: values.get("--title"),
    summary: values.get("--summary"),
    nextStep: values.get("--next-step"),
  };

  if (!(["json", "base64"] as string[]).includes(options.outputEncoding)) {
    throw new Error("--output-encoding must be json or base64");
  }

  const expires = values.get("--expires-in-hours");
  if (expires !== undefined) options.expiresInHours = Number(expires);
  const limit = values.get("--limit");
  if (limit !== undefined) options.limit = Number(limit);

  if (action === "create-workspace" && !options.name?.trim()) {
    throw new Error("create-workspace requires --name");
  }
  if (action === "create-invite") {
    if (!options.workspaceId) throw new Error("create-invite requires --workspace-id");
    if (!options.role || !["editor", "viewer"].includes(options.role)) {
      throw new Error("create-invite requires --role editor or viewer");
    }
    if (!Number.isInteger(options.expiresInHours) || options.expiresInHours! < 1 || options.expiresInHours! > 168) {
      throw new Error("--expires-in-hours must be an integer from 1 to 168");
    }
  }
  if (action === "publish-checkpoint") {
    if (!options.workspaceId) throw new Error("publish-checkpoint requires --workspace-id");
    if (!options.title?.trim()) throw new Error("publish-checkpoint requires --title");
    if (!options.summary?.trim()) throw new Error("publish-checkpoint requires --summary");
  }
  if ((action === "get-latest-checkpoint" || action === "list-checkpoints") && !options.workspaceId) {
    throw new Error(`${action} requires --workspace-id`);
  }
  if (action === "list-checkpoints") {
    options.limit ??= 20;
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
      throw new Error("--limit must be an integer from 1 to 100");
    }
  }
  return options;
}

function toolRequest(options: CliOptions): { name: string; arguments: Record<string, unknown> } {
  switch (options.action) {
    case "whoami":
      return { name: "whoami", arguments: {} };
    case "list-workspaces":
      return { name: "list_workspaces", arguments: {} };
    case "create-workspace":
      return { name: "create_workspace", arguments: { name: options.name!.trim() } };
    case "create-invite":
      return {
        name: "create_invite",
        arguments: {
          workspaceId: options.workspaceId,
          role: options.role,
          expiresInHours: options.expiresInHours,
        },
      };
    case "publish-checkpoint":
      return {
        name: "publish_checkpoint",
        arguments: {
          workspaceId: options.workspaceId,
          title: options.title!.trim(),
          summary: options.summary!.trim(),
          decisions: [],
          nextSteps: options.nextStep?.trim() ? [options.nextStep.trim()] : [],
          blockers: [],
          files: [],
        },
      };
    case "get-latest-checkpoint":
      return {
        name: "get_latest_checkpoint",
        arguments: { workspaceId: options.workspaceId },
      };
    case "list-checkpoints":
      return {
        name: "list_checkpoints",
        arguments: { workspaceId: options.workspaceId, limit: options.limit },
      };
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const apiKey = process.env[options.keyEnv];
  if (!apiKey) throw new Error(`Environment variable ${options.keyEnv} is missing or empty`);

  const client = new Client({ name: "context-bridge-operator", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });

  try {
    await client.connect(transport);
    const result = await client.callTool(toolRequest(options));
    if (result.isError) {
      const content: unknown[] = Array.isArray(result.content) ? result.content : [];
      const message = content
        .filter((item): item is { type: "text"; text: string } => (
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          "text" in item &&
          item.type === "text" &&
          typeof item.text === "string"
        ))
        .map((item) => item.text)
        .join("\n");
      throw new Error(message || "Context Bridge tool call failed");
    }
    const json = JSON.stringify(result.structuredContent ?? { content: result.content });
    console.log(options.outputEncoding === "base64" ? Buffer.from(json, "utf8").toString("base64") : json);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected operator client error";
  console.error(`Context Bridge request failed: ${message}`);
  process.exitCode = 1;
});
