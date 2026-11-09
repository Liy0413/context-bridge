import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLanDiscoveryResponse,
  LAN_DISCOVERY_PROTOCOL,
} from "../src/lan-discovery.js";

test("LAN discovery advertises only public service metadata", () => {
  const response = buildLanDiscoveryResponse("bridge-home", 8787);

  assert.deepEqual(response, {
    protocol: LAN_DISCOVERY_PROTOCOL,
    service: "context-bridge",
    serviceId: "bridge-home",
    version: "0.1.0",
    httpPort: 8787,
    requiresInvite: true,
  });
  assert.equal(JSON.stringify(response).includes("apiKey"), false);
  assert.equal(JSON.stringify(response).includes("inviteCode"), false);
});
