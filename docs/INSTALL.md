# Install on another device

The repository owner publishes the plugin through its GitHub marketplace. A client device then:

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

The device must not start its own Context Bridge server. All devices use the shared HTTPS endpoint already embedded in `mcp.json`.
