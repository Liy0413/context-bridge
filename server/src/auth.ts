import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { Identity } from "./types.js";
import type { JsonStore } from "./store.js";

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class ApiKeyAuthenticator {
  private readonly entries: Array<[string, Identity]>;

  constructor(
    rawUsers: string | undefined,
    private readonly store: JsonStore,
  ) {
    const users = rawUsers ? (JSON.parse(rawUsers) as Record<string, Identity>) : {};
    this.entries = Object.entries(users);
  }

  async authenticate(request: Request): Promise<Identity | null> {
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : request.header("x-context-bridge-key");
    if (!token) return null;
    for (const [candidate, identity] of this.entries) {
      if (safeEqual(token, candidate)) return identity;
    }
    return this.store.authenticateToken(token);
  }
}
