import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";

async function testDirectory(): Promise<string> {
  const base = join(process.cwd(), ".test-data");
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, "context-bridge-"));
}

test("two profiles can share a checkpoint through an invite", async () => {
  const directory = await testDirectory();
  const store = new JsonStore(join(directory, "store.json"));
  const alice = { id: "usr_alice", displayName: "Alice" };
  const bob = { id: "usr_bob", displayName: "Bob" };

  const workspace = await store.createWorkspace(alice, "Demo");
  const invite = await store.createInvite(workspace.id, alice.id, "editor", 24);
  await store.joinWorkspace(bob, invite.code);

  const checkpoint = await store.publishCheckpoint(alice.id, {
    workspaceId: workspace.id,
    title: "Initial handoff",
    summary: "The parser is implemented and the renderer is next.",
    decisions: ["Keep the parser streaming."],
    nextSteps: ["Implement the renderer."],
    blockers: [],
    files: [],
  });

  const resumed = await store.getLatestCheckpoint(bob.id, workspace.id);
  assert.equal(resumed?.id, checkpoint.id);
  assert.equal(resumed?.summary, checkpoint.summary);
});

test("a viewer cannot publish a checkpoint", async () => {
  const directory = await testDirectory();
  const store = new JsonStore(join(directory, "store.json"));
  const alice = { id: "usr_alice", displayName: "Alice" };
  const bob = { id: "usr_bob", displayName: "Bob" };
  const workspace = await store.createWorkspace(alice, "Demo");
  const invite = await store.createInvite(workspace.id, alice.id, "viewer", 24);
  await store.joinWorkspace(bob, invite.code);

  await assert.rejects(
    store.publishCheckpoint(bob.id, {
      workspaceId: workspace.id,
      title: "Nope",
      summary: "Viewers cannot publish.",
      decisions: [],
      nextSteps: [],
      blockers: [],
      files: [],
    }),
    /required workspace role/,
  );
});

test("invite onboarding stores only hashes and issues a working credential", async () => {
  const directory = await testDirectory();
  const filePath = join(directory, "store.json");
  const store = new JsonStore(filePath);
  const alice = { id: "usr_alice", displayName: "Alice" };
  const workspace = await store.createWorkspace(alice, "Demo");
  const invite = await store.createInvite(workspace.id, alice.id, "editor", 24);

  const joined = await store.joinWithInvite(invite.code, "Bob's laptop");
  const authenticated = await store.authenticateToken(joined.apiKey);
  assert.equal(authenticated?.id, joined.profile.id);

  const persisted = await readFile(filePath, "utf8");
  assert.equal(persisted.includes(invite.code), false);
  assert.equal(persisted.includes(joined.apiKey), false);
});

test("a failed mutation does not poison later writes", async () => {
  const directory = await testDirectory();
  const store = new JsonStore(join(directory, "store.json"));
  const alice = { id: "usr_alice", displayName: "Alice" };
  const workspace = await store.createWorkspace(alice, "Demo");

  await assert.rejects(store.joinWithInvite("invalid-invite-code-1234", "Bob"), /invalid/i);

  const invite = await store.createInvite(workspace.id, alice.id, "editor", 24);
  assert.equal(invite.workspaceId, workspace.id);
  assert.equal(invite.role, "editor");
});
