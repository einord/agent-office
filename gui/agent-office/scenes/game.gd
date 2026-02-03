extends Node2D

## Preloaded agent scene for spawning new agents.
@export var agent_scene: PackedScene

@onready var _agents_container: Node2D = $Tilemap/Agents
var _agent_queue: Array = []  # FIFO queue of agents

func _ready() -> void:
	# Clear all existing agents at startup
	for child in _agents_container.get_children():
		child.queue_free()

## Handles keyboard input for spawning and removing agents.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		# Check for + key (unicode 43) or numpad add, or = key (US keyboard)
		if event.unicode == 43 or event.keycode == KEY_KP_ADD or event.keycode == KEY_EQUAL:
			_spawn_agent()
		# Check for - key (unicode 45) or numpad subtract
		elif event.unicode == 45 or event.keycode == KEY_KP_SUBTRACT or event.keycode == KEY_MINUS:
			_send_agent_to_exit()

## Spawns a new agent at the exit location and adds it to the queue.
func _spawn_agent() -> void:
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
	agent.position = spawn_position
	_agents_container.add_child(agent)
	_agent_queue.append(agent)

	# Connect to agent's removal signal
	agent.tree_exiting.connect(_on_agent_removed.bind(agent))

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
