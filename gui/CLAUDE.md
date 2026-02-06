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
│   ├── agent.gd      - Agent behavior, state machine, animations
│   ├── computer.tscn - Computer screen scene (linked to workstation)
│   ├── computer.gd   - Computer on/off with reference counting
│   ├── chair.tscn    - Chair scene (linked to workstation)
│   ├── chair.gd      - Chair with workstation binding
│   ├── user_stats_overlay.tscn - Stats overlay UI
│   ├── user_stats_overlay.gd   - Stats overlay logic
│   ├── viewer_count.tscn - Viewer count display
│   ├── viewer_count.gd   - Viewer count logic
│   ├── tilemap.tscn  - Office tilemap with workstations, computers, chairs
│   └── tileset.tres  - Tile definitions
├── scripts/
│   └── display_manager.gd - Autoload for DPI scaling
└── assets/
    └── sprites/
        ├── template.png           - Agent sprite sheet (28 variants, down+up)
        ├── agent_variant_*.tres   - SpriteFrames per agent variant
        └── *_frames.tres          - SpriteFrames for computers, progress circle
```

## Key Files

- `scenes/game.gd` - WebSocket client, connects to backend on port 3101
- `scenes/agent.gd` - Agent state machine (WORKING/IDLE/LEAVING), workstation selection, chair sitting, computer activation, context bar, directional sprites (up/down)
- `scenes/computer.gd` - Workstation-linked computer with on/off reference counting
- `scenes/chair.gd` - Workstation-linked chair providing sit position and direction

## WebSocket Protocol

Connects to backend WebSocket (default `ws://localhost:3101`):
- Receives `spawn_agent`, `update_agent`, `remove_agent`, `sync_complete`, `user_stats`
- Sends `ack` for spawn/remove, `agent_removed` when agent exits

## Workstation System

Computers and chairs are linked to workstations via `@export var workstation_path: NodePath` (resolved in `_ready()`). They use node groups for runtime lookup:
- `"work_station"` - Marker2D nodes for desk positions
- `"computer"` - Computer screens (turn on/off when agent arrives/leaves)
- `"chair"` - Chairs (agent sits and plays directional animation)

## Gotchas

- Requires Godot 4.x (uses GL Compatibility renderer)
- Pixel-perfect fonts: Use sizes in multiples of 16 (16, 32, 64) for Axolotl font
- Hot-reload: Autoload/script changes require full Godot restart, not just scene reload
- Set agent properties before `add_child()` - that's when `_ready()` runs
- WebSocket URL may need configuration for non-local backends
- Export presets configured for Web deployment
- If Godot adds `script = null` to chair/computer instances in tilemap.tscn, revert it (right-click > Revert to Inherited) — it overrides the scene's script

## Testing Shortcuts

In-game keyboard shortcuts for local testing (no backend needed):
- `+` or `=` - Spawn regular agent
- `J` - Spawn sidechain agent (jr, 70% size)
- `-` - Remove oldest agent
- `1` - Set all test agents to IDLE
- `2` - Set all test agents to WORKING
- `Q` - Decrease context percentage by 12.5%
- `W` - Increase context percentage by 12.5%
