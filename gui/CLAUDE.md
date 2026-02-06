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
├── project.godot     - Engine config (Godot 4.x, GL Compatibility)
├── scenes/
│   ├── main.tscn     - Entry scene, loads game.tscn
│   ├── game.tscn     - Main game scene
│   ├── game.gd       - Game logic, backend WebSocket connection
│   ├── agent.tscn    - Agent character scene
│   ├── agent.gd      - Agent behavior and animations
│   ├── agent_name.tscn - Agent name label
│   ├── computer.tscn - Workstation scene
│   ├── computer.gd   - Workstation behavior
│   ├── user_stats_overlay.tscn - Stats overlay UI
│   ├── user_stats_overlay.gd   - Stats overlay logic
│   ├── viewer_count.tscn - Viewer count display
│   ├── viewer_count.gd   - Viewer count logic
│   ├── tilemap.tscn  - Office tilemap
│   └── tileset.tres  - Tile definitions
├── scripts/
│   └── display_manager.gd - Autoload for DPI scaling
└── assets/           - Sprites and resources
```

## Key Files

- `scenes/game.gd` - WebSocket client, connects to backend on port 3101
- `scenes/agent.gd` - Agent state machine, handles standing/walking animations

## WebSocket Protocol

Connects to backend WebSocket (default `ws://localhost:3101`):
- Receives `spawn_agent`, `update_agent`, `remove_agent`, `sync_complete`, `user_stats`
- Sends `ack` for spawn/remove, `agent_removed` when agent exits

## Gotchas

- Requires Godot 4.x (uses GL Compatibility renderer)
- Pixel-perfect fonts: Use sizes in multiples of 16 (16, 32, 64) for Axolotl font
- Hot-reload: Autoload/script changes require full Godot restart, not just scene reload
- Set agent properties before `add_child()` - that's when `_ready()` runs
- WebSocket URL may need configuration for non-local backends
- Export presets configured for Web deployment

## Testing Shortcuts

In-game keyboard shortcuts for local testing (no backend needed):
- `+` or `=` - Spawn regular agent
- `J` - Spawn sidechain agent (jr, 70% size)
- `-` - Remove oldest agent
