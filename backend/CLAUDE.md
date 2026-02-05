# Backend Server

Express REST API + WebSocket server for agent state management.

## Commands

```bash
npm run dev      # Hot reload with tsx watch
npm run build    # Compile TypeScript
npm start        # Run compiled server
```

## Ports

- `3100` - HTTP REST API
- `3101` - WebSocket for GUI clients

## Key Files

- `src/index.ts` - Server entry, Express + WS setup
- `src/agents/` - Agent CRUD and state management
- `src/auth/` - JWT token generation/validation
- `src/websocket/` - WS message handling for GUI
- `config.json` - User API keys and port config (in project root, not src/)

## API Flow

1. Client authenticates via `POST /auth` with API key
2. Returns JWT token
3. All `/agents/*` endpoints require `Authorization: Bearer <token>`

## WebSocket Protocol

Messages to GUI clients (Backend → Godot):
- `spawn_agent` - New agent appeared
- `update_agent` - State/activity changed
- `remove_agent` - Agent gone
- `sync_complete` - Initial sync done, includes active agent IDs
- `user_stats` - Active users, session counts, agent counts

Messages from GUI clients (Godot → Backend):
- `ack` - Acknowledges spawn/remove commands
- `agent_removed` - Confirms agent left the scene

## Gotchas

- `config.json` must be in working directory when running
- Bruno collection in `bruno/` for API testing
