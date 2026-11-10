import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import test from "node:test";

const helperPath = resolve(
  process.cwd(),
  "..",
  "skills",
  "context-bridge-join",
  "scripts",
  "join-workspace.mjs",
);

async function testDirectory(): Promise<string> {
  const base = resolve(process.cwd(), ".test-data");
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, "portable-join-"));
}

function runHelper(arguments_: string[], inviteCode: string): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [helperPath, ...arguments_], {
      env: { ...process.env, CONTEXT_BRIDGE_INVITE_CODE: inviteCode },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (exitCode) => resolveRun({ exitCode, stdout, stderr }));
  });
}

test("portable join helper saves credentials without printing secrets", async () => {
  const directory = await testDirectory();
  const outputPath = join(directory, "connection.local.json");
  const inviteCode = "test-invite-code-1234567890";
  const apiKey = "ctx_test-secret-api-key";
  let onboardingCalls = 0;
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, service: "context-bridge", serviceId: "test-service" }));
      return;
    }
    if (request.method === "POST" && request.url === "/onboarding/join") {
      onboardingCalls += 1;
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const parsed = JSON.parse(body) as { inviteCode: string; displayName: string };
        assert.equal(parsed.inviteCode, inviteCode);
        assert.equal(parsed.displayName, "Portable test");
        response.statusCode = 201;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          profile: { id: "usr_test", displayName: parsed.displayName },
          workspace: { id: "ws_test", name: "Test workspace" },
          apiKey,
        }));
      });
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await runHelper([
      "--service-url", `http://127.0.0.1:${address.port}`,
      "--allow-private-http",
      "--display-name", "Portable test",
      "--output", outputPath,
    ], inviteCode);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(onboardingCalls, 1);
    assert.equal(result.stdout.includes(inviteCode), false);
    assert.equal(result.stdout.includes(apiKey), false);
    const connection = JSON.parse(await readFile(outputPath, "utf8")) as { apiKey: string; mcpUrl: string };
    assert.equal(connection.apiKey, apiKey);
    assert.equal(connection.mcpUrl, `http://127.0.0.1:${address.port}/mcp`);
  } finally {
    server.close();
  }
});

test("portable join helper refuses an existing output before consuming an invite", async () => {
  const directory = await testDirectory();
  const outputPath = join(directory, "connection.local.json");
  await writeFile(outputPath, "existing", "utf8");
  const result = await runHelper([
    "--service-url", "http://127.0.0.1:9",
    "--allow-private-http",
    "--display-name", "Portable test",
    "--output", outputPath,
  ], "test-invite-code-1234567890");

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /already exists/);
  assert.equal(await readFile(outputPath, "utf8"), "existing");
});
