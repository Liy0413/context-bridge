import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Checkpoint,
  CreatedInvite,
  Credential,
  FileArtifact,
  Identity,
  Invite,
  JoinedProfile,
  Role,
  StoreData,
  Workspace,
} from "./types.js";

const EMPTY_STORE: StoreData = {
  users: {},
  credentials: [],
  workspaces: [],
  invites: [],
  checkpoints: [],
};

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "forbidden"
      | "invalid_invite"
      | "conflict"
      | "payload_too_large",
  ) {
    super(message);
  }
}

export class JsonStore {
  private data: StoreData = structuredClone(EMPTY_STORE);
  private ready: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<StoreData>;
      this.data = {
        users: parsed.users ?? {},
        credentials: parsed.credentials ?? [],
        workspaces: parsed.workspaces ?? [],
        invites: parsed.invites ?? [],
        checkpoints: parsed.checkpoints ?? [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }

  private async mutate<T>(operation: () => T): Promise<T> {
    await this.ready;
    let result!: T;
    this.writeChain = this.writeChain.then(async () => {
      result = operation();
      await this.persist();
    });
    await this.writeChain;
    return result;
  }

  async ensureUser(identity: Identity): Promise<void> {
    await this.mutate(() => {
      this.data.users[identity.id] = identity;
    });
  }

  async authenticateToken(token: string): Promise<Identity | null> {
    await this.ready;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const credential = this.data.credentials.find(
      (item) => item.tokenHash === tokenHash && !item.revokedAt,
    );
    if (!credential) return null;
    return this.data.users[credential.userId]
      ? structuredClone(this.data.users[credential.userId])
      : null;
  }

  async createWorkspace(identity: Identity, name: string): Promise<Workspace> {
    return this.mutate(() => {
      const workspace: Workspace = {
        id: `ws_${randomUUID()}`,
        name,
        createdAt: new Date().toISOString(),
        members: [
          { userId: identity.id, role: "owner", joinedAt: new Date().toISOString() },
        ],
      };
      this.data.workspaces.push(workspace);
      return structuredClone(workspace);
    });
  }

  async listWorkspaces(userId: string): Promise<Workspace[]> {
    await this.ready;
    return this.data.workspaces
      .filter((workspace) => workspace.members.some((member) => member.userId === userId))
      .map((workspace) => structuredClone(workspace));
  }

  private requireMembership(
    workspaceId: string,
    userId: string,
    allowed: Role[],
  ): Workspace {
    const workspace = this.data.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new BridgeError("Workspace not found", "not_found");
    const member = workspace.members.find((item) => item.userId === userId);
    if (!member || !allowed.includes(member.role)) {
      throw new BridgeError("This account does not have the required workspace role", "forbidden");
    }
    return workspace;
  }

  async createInvite(
    workspaceId: string,
    userId: string,
    role: Exclude<Role, "owner">,
    expiresInHours: number,
  ): Promise<CreatedInvite> {
    return this.mutate(() => {
      this.requireMembership(workspaceId, userId, ["owner"]);
      const now = Date.now();
      const code = randomBytes(24).toString("base64url");
      const invite: Invite = {
        codeHash: createHash("sha256").update(code).digest("hex"),
        codePrefix: code.slice(0, 6),
        workspaceId,
        role,
        createdBy: userId,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + expiresInHours * 60 * 60 * 1000).toISOString(),
      };
      this.data.invites.push(invite);
      return { ...structuredClone(invite), code };
    });
  }

  async joinWorkspace(identity: Identity, code: string): Promise<Workspace> {
    return this.mutate(() => {
      const codeHash = createHash("sha256").update(code).digest("hex");
      const invite = this.data.invites.find((item) => item.codeHash === codeHash);
      if (!invite || invite.usedAt || Date.parse(invite.expiresAt) <= Date.now()) {
        throw new BridgeError("Invite is invalid, expired, or already used", "invalid_invite");
      }
      const workspace = this.data.workspaces.find((item) => item.id === invite.workspaceId);
      if (!workspace) throw new BridgeError("Workspace not found", "not_found");
      const existing = workspace.members.find((member) => member.userId === identity.id);
      if (!existing) {
        workspace.members.push({
          userId: identity.id,
          role: invite.role,
          joinedAt: new Date().toISOString(),
        });
      }
      invite.usedBy = identity.id;
      invite.usedAt = new Date().toISOString();
      this.data.users[identity.id] = identity;
      return structuredClone(workspace);
    });
  }

  async joinWithInvite(code: string, displayName: string): Promise<JoinedProfile> {
    return this.mutate(() => {
      const codeHash = createHash("sha256").update(code).digest("hex");
      const invite = this.data.invites.find((item) => item.codeHash === codeHash);
      if (!invite || invite.usedAt || Date.parse(invite.expiresAt) <= Date.now()) {
        throw new BridgeError("Invite is invalid, expired, or already used", "invalid_invite");
      }
      const workspace = this.data.workspaces.find((item) => item.id === invite.workspaceId);
      if (!workspace) throw new BridgeError("Workspace not found", "not_found");

      const profile: Identity = {
        id: `usr_${randomUUID()}`,
        displayName,
      };
      workspace.members.push({
        userId: profile.id,
        role: invite.role,
        joinedAt: new Date().toISOString(),
      });
      invite.usedBy = profile.id;
      invite.usedAt = new Date().toISOString();
      this.data.users[profile.id] = profile;

      const apiKey = `ctx_${randomBytes(32).toString("base64url")}`;
      const credential: Credential = {
        tokenHash: createHash("sha256").update(apiKey).digest("hex"),
        userId: profile.id,
        createdAt: new Date().toISOString(),
        label: "invite-bootstrap",
      };
      this.data.credentials.push(credential);
      return {
        profile: structuredClone(profile),
        workspace: structuredClone(workspace),
        apiKey,
      };
    });
  }

  async publishCheckpoint(
    userId: string,
    input: Omit<Checkpoint, "id" | "sequence" | "createdBy" | "createdAt">,
  ): Promise<Checkpoint> {
    return this.mutate(() => {
      this.requireMembership(input.workspaceId, userId, ["owner", "editor"]);
      const inlineBytes = input.files.reduce((total, file) => {
        if (file.content === undefined) return total;
        return total + Buffer.byteLength(file.content, file.encoding === "base64" ? "base64" : "utf8");
      }, 0);
      if (inlineBytes > 2 * 1024 * 1024) {
        throw new BridgeError("Inline file content exceeds the 2 MiB checkpoint limit", "payload_too_large");
      }
      for (const file of input.files) this.validateFile(file);
      const sequence =
        1 +
        Math.max(
          0,
          ...this.data.checkpoints
            .filter((item) => item.workspaceId === input.workspaceId)
            .map((item) => item.sequence),
        );
      const checkpoint: Checkpoint = {
        ...input,
        id: `cp_${randomUUID()}`,
        sequence,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      this.data.checkpoints.push(checkpoint);
      return structuredClone(checkpoint);
    });
  }

  private validateFile(file: FileArtifact): void {
    if (file.path.startsWith("/") || file.path.includes("..") || /^[A-Za-z]:/.test(file.path)) {
      throw new BridgeError(`File path must be project-relative: ${file.path}`, "conflict");
    }
    if (file.content !== undefined) {
      const size = Buffer.byteLength(file.content, file.encoding === "base64" ? "base64" : "utf8");
      if (size > 256 * 1024) {
        throw new BridgeError(`Inline artifact exceeds 256 KiB: ${file.path}`, "payload_too_large");
      }
      if (size !== file.size) {
        throw new BridgeError(`Declared size does not match content: ${file.path}`, "conflict");
      }
    }
  }

  async getLatestCheckpoint(userId: string, workspaceId: string): Promise<Checkpoint | null> {
    await this.ready;
    this.requireMembership(workspaceId, userId, ["owner", "editor", "viewer"]);
    const checkpoints = this.data.checkpoints
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => b.sequence - a.sequence);
    return checkpoints[0] ? structuredClone(checkpoints[0]) : null;
  }

  async listCheckpoints(userId: string, workspaceId: string, limit: number): Promise<Checkpoint[]> {
    await this.ready;
    this.requireMembership(workspaceId, userId, ["owner", "editor", "viewer"]);
    return this.data.checkpoints
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }
}
