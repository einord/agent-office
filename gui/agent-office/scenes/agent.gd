extends AnimatedSprite2D

enum AgentState { WORKING, IDLE, LEAVING }

@export var movement_speed: float = 25.0
@export var random_range: Vector2 = Vector2(200, 200)  # Område för slumpmässiga positioner
@export var idle_wait_min: float = 5.0  # Minimum wait time in idle state (seconds)
@export var idle_wait_max: float = 10.0  # Maximum wait time in idle state (seconds)
@onready var navigation_agent: NavigationAgent2D = get_node("NavigationAgent2D")
var movement_delta: float
var current_state: AgentState = AgentState.IDLE
var _idle_timer: float = 0.0
var _is_idle_waiting: bool = false

func _ready() -> void:
	navigation_agent.velocity_computed.connect(Callable(_on_velocity_computed))
	# Vänta en frame så att navigationskartan hinner synkroniseras
	await get_tree().physics_frame
	change_state(AgentState.IDLE)

func set_movement_target(movement_target: Vector2):
	navigation_agent.set_target_position(movement_target)

## Changes the agent's state and triggers exit/enter callbacks.
func change_state(new_state: AgentState) -> void:
	if current_state != new_state:
		_exit_state(current_state)
	current_state = new_state
	_enter_state(new_state)

## Called when entering a new state. Sets up the appropriate navigation target.
func _enter_state(state: AgentState) -> void:
	match state:
		AgentState.WORKING:
			_set_work_target()
		AgentState.IDLE:
			_set_idle_target()
		AgentState.LEAVING:
			_set_exit_target()

## Called when exiting a state. Can be used for cleanup.
func _exit_state(state: AgentState) -> void:
	if state == AgentState.IDLE:
		_idle_timer = 0.0
		_is_idle_waiting = false

## Sets target to a random work station from the "work_station" group.
func _set_work_target() -> void:
	var work_stations = get_tree().get_nodes_in_group("work_station")
	if work_stations.size() > 0:
		var target_node = work_stations[randi() % work_stations.size()]
		set_movement_target(target_node.global_position)
	else:
		# Fallback if no work stations exist
		set_movement_target(global_position)

## Sets target to a random position near a break area from the "break_area" group.
func _set_idle_target() -> void:
	var break_areas = get_tree().get_nodes_in_group("break_area")
	if break_areas.size() > 0:
		var target_node = break_areas[randi() % break_areas.size()]
		# Add some randomness around the break area (±20 pixels)
		var random_offset = Vector2(
			randf_range(-20.0, 20.0),
			randf_range(-20.0, 20.0)
		)
		var target = target_node.global_position + random_offset

		# Validate target is on navigation mesh
		var map_rid = navigation_agent.get_navigation_map()
		var closest_point = NavigationServer2D.map_get_closest_point(map_rid, target)
		set_movement_target(closest_point)
	else:
		# Fallback to random wandering if no break areas exist
		_set_random_target()

## Sets target to an exit point from the "exit" group.
func _set_exit_target() -> void:
	var exits = get_tree().get_nodes_in_group("exit")
	if exits.size() > 0:
		var target_node = exits[randi() % exits.size()]
		set_movement_target(target_node.global_position)
	else:
		# Fallback if no exits exist
		set_movement_target(global_position)

func _set_random_target() -> void:
	var map_rid = navigation_agent.get_navigation_map()

	# Try to find a valid target within navigation mesh
	for _attempt in range(10):
		var random_position = Vector2(
			randf_range(-random_range.x / 2, random_range.x / 2),
			randf_range(-random_range.y / 2, random_range.y / 2)
		)
		var target = global_position + random_position

		# Get the closest point on navigation mesh
		var closest_point = NavigationServer2D.map_get_closest_point(map_rid, target)

		# Check if target is actually on the navigation mesh (close to closest point)
		if target.distance_to(closest_point) < 5.0:
			set_movement_target(target)
			return

	# Fallback: use closest valid point on navigation mesh
	var fallback_target = global_position + Vector2(
		randf_range(-random_range.x / 2, random_range.x / 2),
		randf_range(-random_range.y / 2, random_range.y / 2)
	)
	var closest_valid = NavigationServer2D.map_get_closest_point(map_rid, fallback_target)
	set_movement_target(closest_valid)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_1:
				change_state(AgentState.WORKING)
			KEY_2:
				change_state(AgentState.IDLE)
			KEY_3:
				change_state(AgentState.LEAVING)

func _physics_process(delta):
	# Do not query when the map has never synchronized and is empty.
	var map_id = navigation_agent.get_navigation_map()
	var iteration = NavigationServer2D.map_get_iteration_id(map_id)
	if iteration == 0:
		return

	if navigation_agent.is_navigation_finished():
		# Handle state-specific behavior when navigation is complete
		match current_state:
			AgentState.WORKING:
				# Stay at work station - do nothing
				return
			AgentState.IDLE:
				# Wait for a random duration before wandering to a new point
				if not _is_idle_waiting:
					_is_idle_waiting = true
					_idle_timer = randf_range(idle_wait_min, idle_wait_max)
				else:
					_idle_timer -= delta
					if _idle_timer <= 0.0:
						_is_idle_waiting = false
						_set_idle_target()
				return
			AgentState.LEAVING:
				# Stay at exit - do nothing
				return
		return

	movement_delta = movement_speed * delta
	var next_path_position: Vector2 = navigation_agent.get_next_path_position()
	var new_velocity: Vector2 = global_position.direction_to(next_path_position) * movement_speed
	if navigation_agent.avoidance_enabled:
		navigation_agent.set_velocity(new_velocity)
	else:
		_on_velocity_computed(new_velocity)

func _on_velocity_computed(safe_velocity: Vector2) -> void:
	global_position = global_position.move_toward(global_position + safe_velocity, movement_delta)
