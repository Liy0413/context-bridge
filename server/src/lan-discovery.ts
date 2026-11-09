import { createSocket, type Socket } from "node:dgram";

export const LAN_DISCOVERY_REQUEST = "CONTEXT_BRIDGE_DISCOVER_V1";
export const LAN_DISCOVERY_PROTOCOL = "context-bridge-lan-v1";

export interface LanDiscoveryResponse {
  protocol: typeof LAN_DISCOVERY_PROTOCOL;
  service: "context-bridge";
  serviceId: string;
  version: string;
  httpPort: number;
  requiresInvite: true;
}

export function buildLanDiscoveryResponse(
  serviceId: string,
  httpPort: number,
): LanDiscoveryResponse {
  return {
    protocol: LAN_DISCOVERY_PROTOCOL,
    service: "context-bridge",
    serviceId,
    version: "0.1.0",
    httpPort,
    requiresInvite: true,
  };
}

export function startLanDiscovery(
  enabled: boolean,
  serviceId: string,
  httpPort: number,
  discoveryPort: number,
): Socket | null {
  if (!enabled) return null;

  const socket = createSocket("udp4");
  const request = Buffer.from(LAN_DISCOVERY_REQUEST, "utf8");
  const response = Buffer.from(
    JSON.stringify(buildLanDiscoveryResponse(serviceId, httpPort)),
    "utf8",
  );

  socket.on("message", (message, remote) => {
    if (!message.equals(request)) return;
    socket.send(response, remote.port, remote.address);
  });
  socket.on("error", (error) => {
    console.error("Context Bridge LAN discovery error", error);
  });
  socket.bind(discoveryPort, "0.0.0.0", () => {
    console.log(`Context Bridge LAN discovery listening on UDP ${discoveryPort}`);
  });

  return socket;
}
