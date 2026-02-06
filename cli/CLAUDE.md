# CLI Monitor

Terminal-based monitor that tracks Claude Code sessions in real-time.

## Commands

```bash
npm run dev      # Build + run with local backend (key: glxblt2026)
npm run build    # Compile TypeScript
npm start        # Run compiled CLI (no server sync)
```

## Key Files

- `src/index.ts` - CLI entry point
- `src/monitor.ts` - Core logic: process scanning, session reading
- `src/data/` - Data layer: process-scanner, session-reader, activity-tracker, incremental-reader
- `src/types.ts` - Agent states and activity types
- `src/ui/` - Terminal rendering with chalk
- `src/sync/` - Server synchronization client

## How It Works

1. Scans for `claude` processes via `ps`
2. Reads session data from `~/.claude/projects/`
3. Detects activity from tool usage in conversation
4. Calculates context window usage from latest API response tokens
5. Optionally syncs state (activity + context percentage) to backend via REST API

## Environment

```bash
AGENT_OFFICE_SERVER_URL=http://localhost:3100
AGENT_OFFICE_API_KEY=your-key
```

## Gotchas

- Requires `TERM=xterm-256color` for colors (set in npm scripts)
- macOS/Linux only (uses `ps` and `lsof`)
- Dev mode hardcodes API key for convenience
- Dev script syncs to production server (plik.se), not localhost
