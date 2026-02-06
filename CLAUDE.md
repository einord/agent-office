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
- `cli/src/data/` - Process scanning, session reading, activity tracking
- `cli/src/sync/server-client.ts` - Backend sync (activity + context percentage)
- `backend/src/index.ts` - Server entry, auth + WS setup
- `backend/src/api/routes.ts` - All REST API route definitions
- `backend/config.json` - API keys and port config (not in src/)

## Docker

```bash
docker compose up         # Run full stack (backend + CLI)
```

See `.env.example` for required environment variables.

## Gotchas

- Must use pnpm (workspaces) - npm/yarn won't work
- CLI scripts set `TERM=xterm-256color` for chalk colors
- CLI dev hardcodes API key `glxblt2026` for local testing
- Backend reads config.json from cwd, not from src/
- No test suite - manual testing only

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for release-please automation.

**Format**: `<type>(<scope>): <description>`

| Type | When to use | Version impact |
|------|-------------|----------------|
| `feat` | New feature | Minor bump |
| `fix` | Bug fix | Patch bump |
| `perf` | Performance improvement | Patch bump |
| `refactor` | Code refactoring (no behavior change) | None |
| `style` | Code style/formatting (no logic change) | None |
| `docs` | Documentation only | None |
| `chore` | Build, deps, tooling | None |

**Breaking changes**: Add `!` before colon: `feat!: remove deprecated API`

**Examples**:
- `feat: add user stats overlay`
- `fix: resolve memory leak in agent manager`
- `docs: update API documentation`
- `feat(gui): add toggle for expanded view`

## Local Overrides

Create `CLAUDE.local.md` (in root or any subdirectory) for personal settings that shouldn't be committed. These files are gitignored.
