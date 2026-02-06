extends Node2D

## Preloaded agent scene for spawning new agents.
@export var agent_scene: PackedScene

## Available sprite variants for agents.
@export var agent_variants: Array[SpriteFrames] = []

@onready var _agents_container: Node2D = $Tilemap/Agents
var _agent_queue: Array = []  # FIFO queue of agents
var _agents_by_id: Dictionary = {}  # Maps external ID to agent instance

## Reference to the user stats overlay (set via set_user_stats_overlay)
var _user_stats_overlay: Node = null
## Reference to the viewer count overlay (set via set_viewer_count_overlay)
var _viewer_count_overlay: Node = null

# WebSocket client for backend communication
var _socket: WebSocketPeer = WebSocketPeer.new()
var _ws_connected: bool = false

## Returns the WebSocket URL based on platform.
## - Web: Uses current page host with /ws path (proxied via nginx)
## - Desktop: Uses localhost:3101 for local development
func _get_ws_url() -> String:
	if OS.get_name() == "Web":
		# Running in browser - use JavaScript to get current host
		var protocol = JavaScriptBridge.eval("window.location.protocol === 'https:' ? 'wss:' : 'ws:'")
		var host = JavaScriptBridge.eval("window.location.host")
		return "%s//%s/ws" % [protocol, host]
	else:
		# Desktop/local development
		return "ws://localhost:3101"

# Status label for connection state
var _status_label: Label

## The resolved WebSocket URL (set in _ready)
var _ws_url: String = ""

func _ready() -> void:
	# Clear all existing agents at startup
	for child in _agents_container.get_children():
		child.queue_free()

	# Create status label
	_create_status_label()

	# Determine WebSocket URL based on platform
	_ws_url = _get_ws_url()
	print("WebSocket URL: ", _ws_url)

	# Connect to WebSocket server
	var err = _socket.connect_to_url(_ws_url)
	if err != OK:
		push_error("WebSocket connection failed: " + str(err))
	_update_status_label()

## Creates a status label at the bottom of the screen.
func _create_status_label() -> void:
	_status_label = Label.new()
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER

	# Position at bottom-left with some padding
	_status_label.position = Vector2(4, 180)

	# Small font size - scaled for DPI
	_status_label.add_theme_font_size_override("font_size", DisplayManager.get_scaled_font_size(8))

	add_child(_status_label)

## Updates the status label based on connection state.
func _update_status_label() -> void:
	if _status_label == null:
		return

	if _ws_connected:
		_status_label.text = "Connected"
		_status_label.add_theme_color_override("font_color", Color(0.4, 0.8, 0.4))  # Green
	else:
		_status_label.text = "Disconnected"
		_status_label.add_theme_color_override("font_color", Color(0.8, 0.4, 0.4))  # Red

func _process(_delta: float) -> void:
	_poll_websocket()

## Polls the WebSocket for new messages and handles connection state.
func _poll_websocket() -> void:
	_socket.poll()
	var state = _socket.get_ready_state()

	match state:
		WebSocketPeer.STATE_OPEN:
			if not _ws_connected:
				_ws_connected = true
				print("WebSocket connected to ", _ws_url)
				_update_status_label()

			# Process all available messages
			while _socket.get_available_packet_count() > 0:
				var packet = _socket.get_packet()
				var message_str = packet.get_string_from_utf8()
				_handle_ws_message(message_str)

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if _ws_connected:
				_ws_connected = false
				var code = _socket.get_close_code()
				var reason = _socket.get_close_reason()
				print("WebSocket closed. Code: ", code, " Reason: ", reason)
				_update_status_label()
				# Attempt to reconnect after a short delay
				await get_tree().create_timer(2.0).timeout
				var err = _socket.connect_to_url(_ws_url)
				if err != OK:
					push_error("WebSocket reconnection failed: " + str(err))

## Handles incoming WebSocket messages from the backend.
func _handle_ws_message(message_str: String) -> void:
	var json = JSON.new()
	var parse_result = json.parse(message_str)
	if parse_result != OK:
		push_error("Failed to parse WebSocket message: " + message_str)
		return

	var data = json.get_data()
	if not data.has("type"):
		push_error("WebSocket message missing 'type': " + message_str)
		return

	var msg_type = data["type"]
	var payload = data.get("payload", {})

	match msg_type:
		"spawn_agent":
			_handle_spawn_agent(payload)
		"update_agent":
			_handle_update_agent(payload)
		"remove_agent":
			_handle_remove_agent(payload)
		"sync_complete":
			_handle_sync_complete(payload)
		"user_stats":
			_handle_user_stats(payload)
		_:
			push_warning("Unknown WebSocket message type: " + msg_type)

## Handles the spawn_agent command from the backend.
func _handle_spawn_agent(payload: Dictionary) -> void:
	var agent_id = payload.get("id", "")
	var display_name = payload.get("displayName", "")
	var user_name = payload.get("userName", "")
	var variant_index = payload.get("variantIndex", 0)
	var state_str = payload.get("state", "IDLE")
	var parent_id = payload.get("parentId", "")
	if parent_id == null:
		parent_id = ""
	var is_sidechain = payload.get("isSidechain", false)

	if agent_id == "":
		push_error("spawn_agent missing 'id'")
		_send_ack("spawn_agent", agent_id, false)
		return

	if _agents_by_id.has(agent_id):
		push_warning("Agent with id already exists: " + agent_id)
		_send_ack("spawn_agent", agent_id, false)
		return

	# Spawn the agent
	var agent = _spawn_agent_with_params(agent_id, display_name, user_name, variant_index, state_str, parent_id, is_sidechain)
	if agent != null:
		var context_pct = payload.get("contextPercentage", 0)
		if context_pct is float:
			context_pct = int(context_pct)
		agent.set_context_percentage(context_pct)
		var activity = payload.get("activity", "")
		if activity == null:
			activity = ""
		agent.set_activity(activity)
		_send_ack("spawn_agent", agent_id, true)
	else:
		_send_ack("spawn_agent", agent_id, false)

## Handles the update_agent command from the backend.
func _handle_update_agent(payload: Dictionary) -> void:
	var agent_id = payload.get("id", "")
	var state_str = payload.get("state", "")

	if agent_id == "" or not _agents_by_id.has(agent_id):
		push_warning("update_agent: Agent not found with id: " + agent_id)
		return

	var agent = _agents_by_id[agent_id]
	if not is_instance_valid(agent):
		_agents_by_id.erase(agent_id)
		push_warning("update_agent: Agent instance invalid for id: " + agent_id)
		return

	# Use the agent's own enum to avoid preload issues
	var new_state = agent.AgentState.IDLE
	match state_str:
		"WORKING":
			new_state = agent.AgentState.WORKING
		"IDLE":
			new_state = agent.AgentState.IDLE
		"LEAVING":
			new_state = agent.AgentState.LEAVING

	print("update_agent: ", agent_id, " -> ", state_str, " (", new_state, ")")
	agent.change_state(new_state)

	# Update context percentage if present
	var context_pct = payload.get("contextPercentage", -1)
	if context_pct is float:
		context_pct = int(context_pct)
	if context_pct >= 0:
		agent.set_context_percentage(context_pct)

	# Update activity bubble
	var activity = payload.get("activity", "")
	if activity == null:
		activity = ""
	agent.set_activity(activity)

## Handles the remove_agent command from the backend.
func _handle_remove_agent(payload: Dictionary) -> void:
	var agent_id = payload.get("id", "")

	if agent_id == "" or not _agents_by_id.has(agent_id):
		push_warning("remove_agent: Agent not found with id: " + agent_id)
		return

	var agent = _agents_by_id[agent_id]
	if is_instance_valid(agent):
		agent.change_state(agent.AgentState.LEAVING)

## Handles the sync_complete message from the backend.
## Removes any local agents that are not in the backend's active agent list.
func _handle_sync_complete(payload: Dictionary) -> void:
	var active_ids = payload.get("agentIds", [])
	var active_ids_set: Dictionary = {}

	# Build a set of active IDs for quick lookup
	for id in active_ids:
		active_ids_set[id] = true

	# Find and remove agents that are not in the active list
	var stale_agents: Array = []
	for agent_id in _agents_by_id.keys():
		if not active_ids_set.has(agent_id):
			stale_agents.append(agent_id)

	# Set stale agents to LEAVING state
	for agent_id in stale_agents:
		var agent = _agents_by_id[agent_id]
		if is_instance_valid(agent) and agent.current_state != agent.AgentState.LEAVING:
			print("sync_complete: Removing stale agent: ", agent_id)
			agent.change_state(agent.AgentState.LEAVING)

## Handles the user_stats message from the backend.
func _handle_user_stats(payload: Dictionary) -> void:
	if _user_stats_overlay != null and is_instance_valid(_user_stats_overlay):
		_user_stats_overlay.update_stats(payload)
	# Update viewer count from totals
	var totals = payload.get("totals", {})
	var viewer_count = totals.get("viewerCount", 0)
	if _viewer_count_overlay != null and is_instance_valid(_viewer_count_overlay):
		_viewer_count_overlay.update_viewer_count(viewer_count)

## Sets the reference to the user stats overlay node.
func set_user_stats_overlay(overlay: Node) -> void:
	_user_stats_overlay = overlay

## Sets the reference to the viewer count overlay node.
func set_viewer_count_overlay(overlay: Node) -> void:
	_viewer_count_overlay = overlay

## Sends an acknowledgment message to the backend.
func _send_ack(command: String, agent_id: String, success: bool) -> void:
	var message = {
		"type": "ack",
		"payload": {
			"command": command,
			"id": agent_id,
			"success": success
		}
	}
	_send_ws_message(message)

## Sends an agent_removed message to the backend.
func _send_agent_removed(agent_id: String) -> void:
	var message = {
		"type": "agent_removed",
		"payload": {
			"id": agent_id
		}
	}
	_send_ws_message(message)

## Sends a JSON message over WebSocket.
func _send_ws_message(data: Dictionary) -> void:
	if _socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var json_str = JSON.stringify(data)
		_socket.send_text(json_str)

## Handles keyboard input for spawning and removing agents (for local testing).
## +/= spawns agent, J spawns sidechain (jr), - removes agent
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		# + or = key spawns regular agent
		if event.unicode == 43 or event.keycode == KEY_KP_ADD or event.keycode == KEY_EQUAL:
			_spawn_agent(false)
		# J key spawns sidechain (jr) agent
		elif event.keycode == KEY_J:
			_spawn_agent(true)
		# - key removes agent
		elif event.unicode == 45 or event.keycode == KEY_KP_SUBTRACT or event.keycode == KEY_MINUS:
			_send_agent_to_exit()
		# 1 key sets all test agents to IDLE
		elif event.keycode == KEY_1:
			_set_test_agents_state(preload("res://scenes/agent.gd").AgentState.IDLE)
		# 2 key sets all test agents to WORKING
		elif event.keycode == KEY_2:
			_set_test_agents_state(preload("res://scenes/agent.gd").AgentState.WORKING)
		# W key increases context percentage by one step for all test agents
		elif event.keycode == KEY_W:
			_adjust_test_agents_context(12.5)
		# Q key decreases context percentage by one step for all test agents
		elif event.keycode == KEY_Q:
			_adjust_test_agents_context(-12.5)

## Adjusts context percentage for all test agents by a delta value.
func _adjust_test_agents_context(delta: float) -> void:
	for agent in _agent_queue:
		if is_instance_valid(agent) and agent.external_id == "":
			agent.set_context_percentage(agent.context_percentage + delta)

## Spawns a new agent with specified parameters from WebSocket command.
func _spawn_agent_with_params(agent_id: String, display_name: String, user_name: String, variant_index: int, state_str: String, parent_id: String = "", is_sidechain: bool = false) -> Node:
	if agent_scene == null:
		push_error("Agent scene not assigned!")
		return null

	# Get spawn position from exit
	var exits = get_tree().get_nodes_in_group("exit")
	var spawn_position = Vector2(175, 45)  # Default fallback
	if exits.size() > 0:
		spawn_position = exits[0].global_position

	# Instance and add agent
	var agent = agent_scene.instantiate()

	# Set external ID and names
	agent.external_id = agent_id
	agent.display_name = display_name
	agent.user_name = user_name

	# Set parent/sidechain metadata
	agent.parent_agent_id = parent_id
	agent.is_sidechain = is_sidechain

	# Assign sprite variant by index, or deterministically based on agent ID
	if agent_variants.size() > 0 and variant_index >= 0 and variant_index < agent_variants.size():
		agent.set_sprite_variant(agent_variants[variant_index])
	elif agent_variants.size() > 0:
		# Use agent ID as seed for deterministic variant selection
		var variant_idx = _hash_string(agent_id) % agent_variants.size()
		agent.set_sprite_variant(agent_variants[variant_idx])

	agent.position = spawn_position
	_agents_container.add_child(agent)
	_agent_queue.append(agent)
	_agents_by_id[agent_id] = agent

	# Connect to agent's removal signal
	agent.tree_exiting.connect(_on_agent_removed.bind(agent))

	# Set initial state after agent is ready (use agent's own enum)
	var initial_state = agent.AgentState.IDLE
	match state_str:
		"WORKING":
			initial_state = agent.AgentState.WORKING
		"IDLE":
			initial_state = agent.AgentState.IDLE
		"LEAVING":
			initial_state = agent.AgentState.LEAVING
	# Use call_deferred to ensure agent is fully ready
	agent.call_deferred("change_state", initial_state)

	return agent

## Spawns a new agent at the exit location for local testing (keyboard input).
## Use J key to spawn a sidechain (jr) agent.
func _spawn_agent(is_sidechain: bool = false) -> void:
	print("[Game] _spawn_agent called, is_sidechain=", is_sidechain)
	if agent_scene == null:
		push_error("Agent scene not assigned!")
		return

	# Get spawn position from exit
	var exits = get_tree().get_nodes_in_group("exit")
	var spawn_position = Vector2(175, 45)  # Default fallback
	if exits.size() > 0:
		spawn_position = exits[0].global_position

	# Instance and add agent
	var agent = agent_scene.instantiate()

	# Set test display name
	agent.display_name = "Agent 007"
	agent.is_sidechain = is_sidechain

	# Assign random sprite variant
	if agent_variants.size() > 0:
		var random_variant = agent_variants[randi() % agent_variants.size()]
		agent.set_sprite_variant(random_variant)

	agent.position = spawn_position
	_agents_container.add_child(agent)
	_agent_queue.append(agent)

	# Assign a random activity for testing
	var test_activities = ["thinking", "working", "coding", "reading", "writing"]
	agent.set_activity(test_activities[randi() % test_activities.size()])

	# Connect to agent's removal signal
	agent.tree_exiting.connect(_on_agent_removed.bind(agent))

## Sets all test agents (no external_id) to the given state.
func _set_test_agents_state(state: int) -> void:
	for agent in _agent_queue:
		if is_instance_valid(agent) and agent.external_id == "" and agent.current_state != agent.AgentState.LEAVING:
			agent.change_state(state)

## Sends the oldest agent (FIFO) to the exit.
func _send_agent_to_exit() -> void:
	# Find the first agent that is NOT already leaving
	for agent in _agent_queue:
		if is_instance_valid(agent) and agent.current_state != agent.AgentState.LEAVING:
			agent.change_state(agent.AgentState.LEAVING)
			return

## Called when an agent is removed from the scene.
func _on_agent_removed(agent: Node) -> void:
	_agent_queue.erase(agent)

	# If agent has an external ID, notify backend and clean up mapping
	if agent.external_id != "":
		_send_agent_removed(agent.external_id)
		_agents_by_id.erase(agent.external_id)

## Simple hash function for deterministic variant selection.
func _hash_string(s: String) -> int:
	var hash_value: int = 0
	for i in range(s.length()):
		hash_value = ((hash_value << 5) - hash_value) + s.unicode_at(i)
		hash_value = hash_value & 0x7FFFFFFF  # Keep positive
	return hash_value
