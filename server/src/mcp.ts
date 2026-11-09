import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Identity } from "./types.js";
import { BridgeError, JsonStore } from "./store.js";

function success(data: unknown, message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: data as Record<string, unknown>,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    structuredContent: {
      error: error instanceof BridgeError ? error.code : "internal_error",
      message,
    },
  };
}

export function createMcpServer(store: JsonStore, identity: Identity): McpServer {
  const server = new McpServer({ name: "context-bridge", version: "0.1.0" });

  server.registerTool(
    "whoami",
    {
      title: "Get Context Bridge profile",
      description: "Return the stable profile represented by the authenticated connection.",
      inputSchema: {},
      _meta: { securitySchemes: [{ type: "http", scheme: "bearer" }] },
    },
    async () => success({ profile: identity }, `Connected as ${identity.displayName} (${identity.id}).`),
  );

  server.registerTool(
    "create_workspace",
    {
      title: "Create shared workspace",
      description: "Create a shared Context Bridge workspace owned by the current profile.",
      inputSchema: { name: z.string().min(1).max(100) },
    },
    async ({ name }) => {
      try {
        const workspace = await store.createWorkspace(identity, name);
        return success({ workspace }, `Created workspace ${workspace.name} (${workspace.id}).`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_workspaces",
    {
      title: "List shared workspaces",
      description: "List workspaces available to the current profile and its role in each one.",
      inputSchema: {},
    },
    async () => {
      try {
        const workspaces = await store.listWorkspaces(identity.id);
        return success({ workspaces }, `Found ${workspaces.length} workspace(s).`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "create_invite",
    {
      title: "Invite another profile",
      description: "Create a one-time, expiring invite. Only workspace owners may call this tool.",
      inputSchema: {
        workspaceId: z.string().min(1),
        role: z.enum(["editor", "viewer"]),
        expiresInHours: z.number().int().min(1).max(168).default(24),
      },
    },
    async ({ workspaceId, role, expiresInHours }) => {
      try {
        const invite = await store.createInvite(workspaceId, identity.id, role, expiresInHours);
        return success(
          { invite },
          `Created a one-time ${role} invite that expires at ${invite.expiresAt}. Treat the code as a secret.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "join_workspace",
    {
      title: "Join shared workspace",
      description: "Join a workspace using a one-time invite code.",
      inputSchema: { inviteCode: z.string().min(16).max(128) },
    },
    async ({ inviteCode }) => {
      try {
        const workspace = await store.joinWorkspace(identity, inviteCode);
        return success({ workspace }, `Joined ${workspace.name} (${workspace.id}).`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  const fileSchema = z.object({
    path: z.string().min(1).max(500),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    size: z.number().int().nonnegative(),
    status: z.enum(["added", "modified", "deleted", "unchanged"]),
    content: z.string().optional(),
    encoding: z.enum(["utf8", "base64"]).optional(),
  });

  server.registerTool(
    "publish_checkpoint",
    {
      title: "Publish work checkpoint",
      description:
        "Publish explicit handoff context and a file manifest. Inline content is limited to 256 KiB per file and 2 MiB total.",
      inputSchema: {
        workspaceId: z.string().min(1),
        title: z.string().min(1).max(200),
        summary: z.string().min(1).max(20_000),
        decisions: z.array(z.string().max(2_000)).max(100).default([]),
        nextSteps: z.array(z.string().max(2_000)).max(100).default([]),
        blockers: z.array(z.string().max(2_000)).max(100).default([]),
        files: z.array(fileSchema).max(2_000).default([]),
        sourceRef: z.string().max(2_000).optional(),
      },
    },
    async (input) => {
      try {
        const checkpoint = await store.publishCheckpoint(identity.id, input);
        return success(
          { checkpoint },
          `Published checkpoint #${checkpoint.sequence} (${checkpoint.id}) with ${checkpoint.files.length} file record(s).`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_latest_checkpoint",
    {
      title: "Get latest work checkpoint",
      description: "Retrieve the newest checkpoint visible to the current profile.",
      inputSchema: { workspaceId: z.string().min(1) },
    },
    async ({ workspaceId }) => {
      try {
        const checkpoint = await store.getLatestCheckpoint(identity.id, workspaceId);
        return success(
          { checkpoint },
          checkpoint ? `Loaded checkpoint #${checkpoint.sequence} (${checkpoint.id}).` : "No checkpoint exists yet.",
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_checkpoints",
    {
      title: "List work checkpoints",
      description: "List recent checkpoint metadata and contents for a workspace.",
      inputSchema: {
        workspaceId: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ workspaceId, limit }) => {
      try {
        const checkpoints = await store.listCheckpoints(identity.id, workspaceId, limit);
        return success({ checkpoints }, `Found ${checkpoints.length} checkpoint(s).`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
