import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ApiKeyAuthenticator } from "./auth.js";
import { createMcpServer } from "./mcp.js";
import { JsonStore } from "./store.js";

const port = Number(process.env.PORT ?? 8787);
const dataPath = process.env.CONTEXT_BRIDGE_DATA ?? "./data/store.json";
const serviceId = process.env.CONTEXT_BRIDGE_SERVICE_ID ?? "context-bridge-local";
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const isProduction = process.env.NODE_ENV === "production";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

if (isProduction) {
  const parsedPublicUrl = new URL(publicBaseUrl);
  if (
    parsedPublicUrl.protocol !== "https:" ||
    parsedPublicUrl.hostname === "bridge.example.com" ||
    parsedPublicUrl.hostname === "localhost" ||
    parsedPublicUrl.hostname === "127.0.0.1"
  ) {
    throw new Error("PUBLIC_BASE_URL must be the real public HTTPS service URL in production");
  }
}

const store = new JsonStore(dataPath);
const authenticator = new ApiKeyAuthenticator(process.env.CONTEXT_BRIDGE_USERS, store);
const app = express();
const onboardingAttempts = new Map<string, { count: number; resetAt: number }>();

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  const hopCount = Number(trustProxy);
  if (!Number.isInteger(hopCount) || hopCount < 1 || hopCount > 10) {
    throw new Error("TRUST_PROXY must be an integer between 1 and 10");
  }
  app.set("trust proxy", hopCount);
}

app.use(express.json({ limit: "4mb" }));
app.use((_request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "context-bridge",
    serviceId,
    version: "0.1.0",
    mode: "single-shared-service",
  });
});

app.get("/info", (_request, response) => {
  response.json({
    service: "context-bridge",
    serviceId,
    version: "0.1.0",
    mcpEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/mcp`,
    architecture: "github-distribution-central-mcp",
  });
});

app.post("/onboarding/join", async (request, response) => {
  response.set("Cache-Control", "no-store");
  const client = request.ip || "unknown";
  const now = Date.now();
  const attempt = onboardingAttempts.get(client);
  if (!attempt || attempt.resetAt <= now) {
    onboardingAttempts.set(client, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else if (attempt.count >= 10) {
    response.status(429).json({ error: "rate_limited" });
    return;
  } else {
    attempt.count += 1;
  }

  const inviteCode = typeof request.body?.inviteCode === "string" ? request.body.inviteCode : "";
  const displayName = typeof request.body?.displayName === "string" ? request.body.displayName.trim() : "";
  if (inviteCode.length < 20 || displayName.length < 1 || displayName.length > 100) {
    response.status(400).json({ error: "invalid_request" });
    return;
  }

  try {
    const joined = await store.joinWithInvite(inviteCode, displayName);
    response.status(201).json({
      profile: joined.profile,
      workspace: joined.workspace,
      apiKey: joined.apiKey,
      warning: "This API key is shown once. Store it securely and never commit it.",
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "invalid_invite") {
      response.status(400).json({ error: "invalid_invite" });
      return;
    }
    response.status(500).json({ error: "internal_error" });
  }
});

app.post("/mcp", async (request, response) => {
  const identity = await authenticator.authenticate(request);
  if (!identity) {
    response
      .status(401)
      .set("Cache-Control", "no-store")
      .set("WWW-Authenticate", 'Bearer realm="context-bridge"')
      .json({ error: "unauthorized" });
    return;
  }

  await store.ensureUser(identity);
  const server = createMcpServer(store, identity);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(request, response, request.body);
});

app.get("/mcp", (_request, response) => {
  response.status(405).set("Allow", "POST").json({ error: "method_not_allowed" });
});

app.delete("/mcp", (_request, response) => {
  response.status(405).set("Allow", "POST").json({ error: "method_not_allowed" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof SyntaxError) {
    response.status(400).json({ error: "invalid_json" });
    return;
  }
  console.error("Unhandled request error", error);
  response.status(500).json({ error: "internal_error" });
});

app.listen(port, () => {
  console.log(`Context Bridge listening on http://localhost:${port}`);
});
