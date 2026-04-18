# Event Mode

Special build for live events where audience members install a small client and
appear as avatars on a shared big-screen Godot view. No API keys required.

## How it works

```
Audience laptop                   Event server (your laptop)
─────────────────                 ──────────────────────────
agent-office-event   ──mDNS─►     mDNS / UDP responder
       │             ◄──URL──     (port 3102)
       │
       ├─POST /auth/anonymous──►  Anonymous auth (rate-limited)
       │             ◄──token──
       │
       ├─POST /agents──────────►  Presence agent
       │
       └─Watches ~/.claude/────►  PUT /agents/:id (activity)
```

- **Server discovery**: client tries mDNS first (`_agentoffice._tcp.local`), then
  falls back to UDP broadcast on port 3102, then prompts for a manual IP.
- **Identity**: client generates a random `userKey` on first launch and saves it
  in `~/.agent-office-event.json` so reconnects reuse the same avatar.
- **Activity**: client only watches `~/.claude/projects/` (no `ps`/`lsof`), so it
  works on macOS, Linux **and** Windows.

## Server setup (one command)

On the presenter's laptop:

```bash
pnpm event
```

That's it. The [start-event.sh](scripts/start-event.sh) script will:
1. Check dependencies (`pnpm`, `bun`, Godot).
2. Copy `config.event.example.json` → `config.json` if missing.
3. Build the backend and CLI if their `dist/` folders are empty.
4. Build the standalone client binaries for macOS/Windows/Linux (first run only; re-run with `pnpm event:rebuild` to force).
5. Free ports 3100/3101/3102 if something else was listening.
6. Start the backend in `EVENT_MODE` with a randomly generated admin token.
7. Launch Godot (`/Applications/Godot.app` by default; override with `GODOT=/path/to/godot`).
8. Print the URL for the audience: `http://<lan-ip>:3100/download`.
9. Clean up everything on Ctrl+C.

### Manual steps (if you prefer)

1. Copy the example config:
   ```bash
   cp backend/config.event.example.json backend/config.json
   ```

2. Build client binaries:
   ```bash
   cd cli && npm run build:event-binaries
   ```

3. Start backend with `EVENT_MODE=true`:
   ```bash
   cd backend && EVENT_MODE=true EVENT_ADMIN_TOKEN=secret npm start
   ```

4. Open Godot and run the scene.

5. Audience URL:
   ```
   http://<your-laptop-ip>:3100/download
   ```

## Audience flow

1. Open the URL → download the right binary for their OS.
2. macOS: **if the binary is notarized (see below)**, it just runs. Otherwise: right-click → *Open* (Gatekeeper). Windows: *More info* → *Run anyway*.
3. Type a name when prompted.
4. Client finds the server automatically and creates a presence avatar.
5. Start Claude Code → activity appears on the big screen.

## Apple code signing & notarization (optional but recommended for macOS)

If you have an Apple Developer account, the macOS binaries can be signed and
notarized so audience members don't see Gatekeeper warnings at all.

**One-time setup** (per presenter laptop):

1. Install your *Developer ID Application* certificate in login keychain.
   Verify: `security find-identity -v -p codesigning`
2. Generate an app-specific password at https://account.apple.com/
3. Save as notarytool profile:
   ```bash
   xcrun notarytool store-credentials "agent-office-notary" \
     --apple-id "<your-email>" --team-id "<TEAMID>"
   ```

**Build signed + notarized binaries** (use the shortcut from repo root):

```bash
pnpm event:release    # signed + notarized, ready for distribution
pnpm event:build      # quick build, no signing (for iterating on the client)
```

Or call the script directly: `cd cli && node scripts/build-event-binaries.mjs --notarize`

The build script will:
- Auto-download **Bun 1.2.17** (pinned — newer versions produce Mach-O binaries
  that macOS codesign can't handle) into `cli/.bun-pinned/`
- Compile the event client for each target
- Codesign macOS binaries with hardened runtime + JIT entitlements
- Upload to Apple for notarization (takes 2-5 min per binary, blocks until done)

After notarization completes, the binary is ready — Apple's ticket is verified
online at first launch, no stapling needed for standalone executables.

**Skip signing** (faster iteration): `--skip-sign` or `SIGN=0`.

**Environment overrides**:
- `SIGN_IDENTITY="Developer ID Application: ..."` — use a specific cert
- `NOTARY_PROFILE=my-profile` — use a different keychain profile
- `BUN=/path/to/bun` — use a specific Bun binary instead of the pinned one

## Admin commands

Reset all anonymous agents between rounds:
```bash
curl -X DELETE http://localhost:3100/event/flush \
  -H "X-Event-Admin: <your admin token>"
```

## Environment variable shortcuts

You can enable event mode without editing `config.json`:
```bash
EVENT_MODE=true \
EVENT_NAME="Plik Demo" \
EVENT_ADMIN_TOKEN=secret \
npm start
```
