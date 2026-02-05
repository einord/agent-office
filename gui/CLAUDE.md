# GUI Client

Godot 4.6 game client that visualizes Claude Code agents in a 2D office environment.

## Commands

```bash
# Open in Godot Editor
godot gui/agent-office/project.godot

# Run from command line
godot --path gui/agent-office

# Export (after configuring export presets)
godot --path gui/agent-office --export-release "Web"
```

## Project Structure

```
agent-office/
├── project.godot     - Engine config (Godot 4.6, GL Compatibility)
├── scenes/
│   ├── main.tscn     - Entry scene
│   ├── game.tscn     - Main game scene
│   ├── game.gd       - Game logic, backend WebSocket connection
│   ├── agent.tscn    - Agent character scene
│   ├── agent.gd      - Agent behavior and animations
│   ├── tilemap.tscn  - Office tilemap
│   └── tileset.tres  - Tile definitions
└── assets/           - Sprites and resources
```

## Key Files

- `scenes/game.gd` - WebSocket client, connects to backend on port 3101
- `scenes/agent.gd` - Agent state machine, handles standing/walking animations

## WebSocket Protocol

Connects to backend WebSocket (default `ws://localhost:3101`):
- Receives `spawn_agent`, `update_agent`, `remove_agent` messages
- Visualizes agent state and activity in real-time

## Gotchas

- Requires Godot 4.6+ (uses GL Compatibility renderer)
- WebSocket URL may need configuration for non-local backends
- Export presets configured for Web deployment
