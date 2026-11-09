export type Role = "owner" | "editor" | "viewer";

export interface Identity {
  id: string;
  displayName: string;
  email?: string;
}

export interface Member {
  userId: string;
  role: Role;
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  members: Member[];
}

export interface Invite {
  codeHash: string;
  codePrefix: string;
  workspaceId: string;
  role: Exclude<Role, "owner">;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedBy?: string;
  usedAt?: string;
}

export interface CreatedInvite extends Invite {
  code: string;
}

export interface Credential {
  tokenHash: string;
  userId: string;
  createdAt: string;
  label: string;
  revokedAt?: string;
}

export interface JoinedProfile {
  profile: Identity;
  workspace: Workspace;
  apiKey: string;
}

export interface FileArtifact {
  path: string;
  sha256: string;
  size: number;
  status: "added" | "modified" | "deleted" | "unchanged";
  content?: string;
  encoding?: "utf8" | "base64";
}

export interface Checkpoint {
  id: string;
  workspaceId: string;
  sequence: number;
  title: string;
  summary: string;
  decisions: string[];
  nextSteps: string[];
  blockers: string[];
  files: FileArtifact[];
  sourceRef?: string;
  createdBy: string;
  createdAt: string;
}

export interface StoreData {
  users: Record<string, Identity>;
  credentials: Credential[];
  workspaces: Workspace[];
  invites: Invite[];
  checkpoints: Checkpoint[];
}
