# Install on another device

The repository owner publishes the plugin through its GitHub marketplace. The installed `mcp.json` already points to the shared public HTTPS service; no OpenAI Platform Tunnel or local server is required on a client device.

A client device then:

1. Installs the marketplace:

   ```sh
   codex plugin marketplace add Liy0413/context-bridge
   ```

2. Installs and enables `context-bridge` from the plugin browser.
3. Runs the onboarding helper from the cloned repository:

   ```powershell
   .\scripts\join-workspace.ps1 -DisplayName "My laptop"
   ```

4. Enters the one-time invite code.
5. Uses the `apiKey` stored in `connection.local.json` when the plugin asks for its bearer credential.
6. Starts a new Codex conversation and asks Context Bridge to resume the latest checkpoint.

The device must not start its own Context Bridge server. All devices use the shared HTTPS endpoint already embedded in `mcp.json`. If `join-workspace.ps1` reports that the URL is still `bridge.example.com`, the repository owner has not yet configured a real deployment.

## Optional trusted-LAN onboarding

When the server and new device are on the same trusted private network, the new device can discover the server automatically:

```powershell
.\scripts\join-workspace-lan.ps1 -DisplayName "My laptop"
```

The server operator must first set `CONTEXT_BRIDGE_LAN_DISCOVERY=1`, restart the server, and allow TCP 8787 plus UDP 8788 on the private-network firewall. On Windows, run `scripts/enable-lan-access.ps1` from an elevated PowerShell window.

Discovery reveals only the service ID and ports. Joining still requires the one-time invite. LAN onboarding uses plain HTTP, so use it only on a trusted home or office network. The plugin continues to use the repository's public HTTPS MCP URL when the device is outside that LAN.
