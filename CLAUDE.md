# Agent Office

TypeScript monorepo for monitoring Claude Code sessions in real-time.

## Quick Start

```bash
pnpm install          # Must use pnpm (workspace)
pnpm dev              # Start CLI in dev mode
pnpm build            # Build CLI for distribution
```

## Component Development

```bash
# Backend (Express + WebSocket)
cd backend && npm run dev    # Hot reload on :3100/:3101

# CLI (connects to backend)
cd cli && npm run dev        # Builds and runs with test server

# GUI (Godot client)
godot gui/agent-office/project.godot  # Open in editor

# Build all
pnpm build
```

## Architecture

```
cli/       - Terminal monitor, reads ~/.claude/projects/
backend/   - Express REST + WebSocket server
gui/       - Godot 4.x client, 2D office visualization
```

## Key Files

- `cli/src/monitor.ts` - Core session scanning logic
- `backend/src/index.ts` - Server entry, auth + WS setup
- `backend/config.json` - API keys and port config (not in src/)

## Gotchas

- Must use pnpm (workspaces) - npm/yarn won't work
- CLI scripts set `TERM=xterm-256color` for chalk colors
- CLI dev hardcodes API key `glxblt2026` for local testing
- Backend reads config.json from cwd, not from src/
- No test suite - manual testing only

## Local Overrides

Create `CLAUDE.local.md` (in root or any subdirectory) for personal settings that shouldn't be committed. These files are gitignored.
