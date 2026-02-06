extends AnimatedSprite2D

enum AgentState { WORKING, IDLE, LEAVING }

## Scale factor for sidechain agents (sub-agents)
const SIDECHAIN_SCALE := 0.7

@export var movement_speed: float = 25.0
@export var random_range: Vector2 = Vector2(200, 200)  # Område för slumpmässiga positioner
@export var idle_wait_min: float = 5.0  # Minimum wait time in idle state (seconds)
@export var idle_wait_max: float = 10.0  # Maximum wait time in idle state (seconds)
@export var exit_wait_time: float = 2.0  # Time to wait at exit before despawning (seconds)
@export var idle_grace_period: float = 5.0  # Seconds to wait at workstation before going idle
@onready var navigation_agent: NavigationAgent2D = get_node("NavigationAgent2D")
@onready var _anim_player: AnimationPlayer = $AnimationPlayer
@onready var _context_bar: ColorRect = $ContextBar
var _context_bar_init_length: float = 0.0
var _name_label: Label = null
var _ui_layer: Control = null
var movement_delta: float
var current_state: AgentState = AgentState.IDLE
var _idle_timer: float = 0.0
var _is_idle_waiting: bool = false
var _exit_timer: float = 0.0
var _is_exit_waiting: bool = false
var _idle_grace_timer: float = 0.0
var _is_idle_grace_waiting: bool = false
var external_id: String = ""
var display_name: String = ""
var user_name: String = ""
## Parent agent ID if this is a sub-agent (sidechain)
var parent_agent_id: String = ""
## Whether this is a sidechain (sub-agent)
var is_sidechain: bool = false
## Reference to the chosen workstation Marker2D
var current_workstation: Marker2D = null
## Remembered workstation from last work session (preferred for next time)
var _preferred_workstation: Marker2D = null
## Flag to only trigger computer activation once per work session
var _has_arrived_at_work: bool = false
## Whether the agent is currently sitting (chair animation playing)
var _is_sitting: bool = false
## Context window usage percentage (0-100)
var context_percentage: float = 0.0

func _ready() -> void:
	add_to_group("agent")
	navigation_agent.velocity_computed.connect(Callable(_on_velocity_computed))
	_setup_name_label()
	# Vänta en frame så att navigationskartan hinner synkroniseras
	await get_tree().physics_frame
	_enter_state(current_state)

## Creates the name label in the UI layer (unscaled).
func _setup_name_label() -> void:
	# Find UILayer in the main scene
	var main_node = get_tree().root.get_node_or_null("Main")
	if main_node:
		_ui_layer = main_node.get_node_or_null("UILayer")

	if _ui_layer == null:
		return

	# Create label dynamically
	_name_label = Label.new()
	_name_label.text = _get_label_text()
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

	# Load the same font as the original AgentName label
	var font = load("res://assets/fonts/Axolotl.ttf")
	if font:
		var label_settings = LabelSettings.new()
		label_settings.font = font
		# Smaller font for sidechain agents, with DPI scaling for high-density screens
		var base_font_size = 22 if is_sidechain else 32
		var base_outline_size = 6 if is_sidechain else 8
		label_settings.font_size = DisplayManager.get_scaled_font_size(base_font_size)
		label_settings.outline_color = Color.BLACK
		label_settings.outline_size = DisplayManager.get_scaled_size(base_outline_size)
		_name_label.label_settings = label_settings

	_ui_layer.add_child(_name_label)

	# Create context progress bar (background + fill)
	_context_bar_init_length = _context_bar.size.x
	_context_bar.color = Color(0.2, 0.8, 0.2)
	_context_bar.size.x = 0

## Returns the formatted label text with display name and optional user name.
## Sidechain agents get "jr" suffix.
func _get_label_text() -> String:
	var name_text = display_name if display_name != "" else "Agent 007"
	if is_sidechain:
		name_text += " jr"
	if user_name != "":
		return "%s (%s)" % [name_text, user_name]
	return name_text

func _exit_tree() -> void:
	# Clean up UI elements when agent is removed
	if _name_label and is_instance_valid(_name_label):
		_name_label.queue_free()

func set_movement_target(movement_target: Vector2):
	navigation_agent.set_target_position(movement_target)

## Sets the sprite frames for this agent. Call this right after instantiation.
func set_sprite_variant(frames: SpriteFrames) -> void:
	sprite_frames = frames
	# Apply sidechain scaling after sprite is set
	if is_sidechain:
		scale = Vector2(SIDECHAIN_SCALE, SIDECHAIN_SCALE)

## Changes the agent's state and triggers exit/enter callbacks.
## If already WORKING and receiving WORKING again, stays at current workstation.
## Transitions from WORKING to IDLE have a grace period to avoid immediate wandering.
func change_state(new_state: AgentState) -> void:
	# If we're in grace period waiting to go idle...
	if _is_idle_grace_waiting:
		if new_state == AgentState.WORKING:
			# Got work again — cancel the grace period, stay at workstation
			_is_idle_grace_waiting = false
			_idle_grace_timer = 0.0
			return
		if new_state == AgentState.LEAVING:
			# Must leave — cancel grace period and transition immediately
			_is_idle_grace_waiting = false
			_idle_grace_timer = 0.0

	if current_state == new_state:
		return

	# Delay WORKING → IDLE transition with a grace period
	if current_state == AgentState.WORKING and new_state == AgentState.IDLE:
		_is_idle_grace_waiting = true
		_idle_grace_timer = idle_grace_period
		return

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
	match state:
		AgentState.WORKING:
			_activate_workstation_computers(false)
			_preferred_workstation = current_workstation
			current_workstation = null
			_has_arrived_at_work = false
			_is_sitting = false
			_is_idle_grace_waiting = false
			_idle_grace_timer = 0.0
		AgentState.IDLE:
			_idle_timer = 0.0
			_is_idle_waiting = false
		AgentState.LEAVING:
			_exit_timer = 0.0
			_is_exit_waiting = false

## Sets target to a random work station from the "work_station" group.
## Prefers unoccupied stations; falls back to any if all are taken.
func _set_work_target() -> void:
	var work_stations = get_tree().get_nodes_in_group("work_station")
	if work_stations.size() == 0:
		set_movement_target(global_position)
		return

	# Collect occupied workstations from other agents
	var occupied: Dictionary = {}
	for other in get_tree().get_nodes_in_group("agent"):
		if other != self and other.current_workstation != null:
			occupied[other.current_workstation] = true

	# Try preferred workstation first if it's free
	if _preferred_workstation != null and not occupied.has(_preferred_workstation):
		current_workstation = _preferred_workstation
		set_movement_target(current_workstation.global_position)
		return

	# Prefer unoccupied stations
	var free_stations: Array = []
	for ws in work_stations:
		if not occupied.has(ws):
			free_stations.append(ws)

	var pool = free_stations if free_stations.size() > 0 else work_stations
	var target_node = pool[randi() % pool.size()]
	current_workstation = target_node
	set_movement_target(target_node.global_position)

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

func _process(_delta: float) -> void:
	_update_label_position()

## Updates the name label position to follow the agent in screen space.
func _update_label_position() -> void:
	if _name_label == null or _ui_layer == null:
		return

	# Get the SubViewport and SubViewportContainer to calculate scale
	var viewport = get_viewport()
	if viewport == null:
		return

	var viewport_container = viewport.get_parent()
	if viewport_container == null or not viewport_container is SubViewportContainer:
		return

	# Calculate scale factor
	var game_size = Vector2(200, 144)
	var container_size = viewport_container.size
	var scale_factor = container_size / game_size

	# Get the viewport container's position in screen space (accounts for AspectRatioContainer offset)
	var container_offset = viewport_container.global_position

	# Convert agent position to screen position
	var screen_pos = global_position * scale_factor + container_offset

	# Offset label above the agent sprite
	var label_offset = Vector2(0, -12) * scale_factor

	# Center the label horizontally and round to nearest pixel
	var final_pos
	if is_sidechain:
		final_pos = screen_pos + label_offset - Vector2(_name_label.size.x / 2, 0) + Vector2(0, 50)  # Slightly lower for sidechain agents
	else:
		final_pos = screen_pos + label_offset - Vector2(_name_label.size.x / 2, 0) # Center horizontally
	_name_label.position = final_pos.round()

	# Position progress bar below the label
	_context_bar.size.x = _context_bar_init_length * (context_percentage / 100.0)

func _physics_process(delta):
	# Do not query when the map has never synchronized and is empty.
	var map_id = navigation_agent.get_navigation_map()
	var iteration = NavigationServer2D.map_get_iteration_id(map_id)
	if iteration == 0:
		return

	if navigation_agent.is_navigation_finished():
		# Play typing animation when working at a station, standing otherwise
		if current_state == AgentState.WORKING and _has_arrived_at_work:
			if _anim_player.current_animation != "typing":
				_anim_player.play("typing")
		elif not _is_sitting:
			if _anim_player.current_animation != "standing":
				_anim_player.play("standing")

		# Handle state-specific behavior when navigation is complete
		match current_state:
			AgentState.WORKING:
				# Activate computers and sit in chair when first arriving at workstation
				if not _has_arrived_at_work:
					_has_arrived_at_work = true
					_activate_workstation_computers(true)
					_sit_in_chair()
				# Handle grace period countdown before transitioning to IDLE
				if _is_idle_grace_waiting:
					_idle_grace_timer -= delta
					if _idle_grace_timer <= 0.0:
						_is_idle_grace_waiting = false
						_exit_state(AgentState.WORKING)
						current_state = AgentState.IDLE
						_enter_state(AgentState.IDLE)
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
				# Wait at exit, then despawn
				if not _is_exit_waiting:
					_is_exit_waiting = true
					_exit_timer = exit_wait_time
				else:
					_exit_timer -= delta
					if _exit_timer <= 0.0:
						queue_free()
				return
		return

	# Start chair animation early when close to workstation
	if current_state == AgentState.WORKING and not _is_sitting and current_workstation != null:
		if global_position.distance_to(current_workstation.global_position) < 6.0:
			_sit_in_chair()

	movement_delta = movement_speed * delta
	var next_path_position: Vector2 = navigation_agent.get_next_path_position()
	var new_velocity: Vector2 = global_position.direction_to(next_path_position) * movement_speed
	if navigation_agent.avoidance_enabled:
		navigation_agent.set_velocity(new_velocity)
	else:
		_on_velocity_computed(new_velocity)

func _on_velocity_computed(safe_velocity: Vector2) -> void:
	# Flip sprite horizontally based on movement direction
	if safe_velocity.x < 0:
		flip_h = true
	elif safe_velocity.x > 0:
		flip_h = false

	# Switch sprite facing based on vertical movement
	if not _is_sitting:
		if safe_velocity.y < -0.1 and animation != &"up":
			play(&"up")
		elif safe_velocity.y >= 0.0 and animation != &"down":
			play(&"down")

	# Play walking animation when moving (unless sitting in a chair)
	if not _is_sitting:
		if safe_velocity.length() > 0.1:
			if _anim_player.current_animation != "walking":
				_anim_player.play("walking")
		else:
			if current_state == AgentState.WORKING and _has_arrived_at_work:
				if _anim_player.current_animation != "typing":
					_anim_player.play("typing")
			else:
				if _anim_player.current_animation != "standing":
					_anim_player.play("standing")

	global_position = global_position.move_toward(global_position + safe_velocity, movement_delta)

## Updates the context window percentage and the progress bar color/width.
## Color transitions: green (0%) → yellow (50%) → red (100%).
func set_context_percentage(percentage: float) -> void:
	context_percentage = clampf(percentage, 0.0, 100.0)
	var t = context_percentage / 100.0
	if t <= 0.5:
		# Green → Yellow (0-50%)
		_context_bar.color = Color(0.2, 0.8, 0.2).lerp(Color(0.9, 0.9, 0.2), t * 2.0)
	else:
		# Yellow → Red (50-100%)
		_context_bar.color = Color(0.9, 0.9, 0.2).lerp(Color(0.9, 0.2, 0.2), (t - 0.5) * 2.0)

## Plays a chair animation on the agent based on the linked chair's direction.
func _sit_in_chair() -> void:
	if current_workstation == null:
		return
	for chair in get_tree().get_nodes_in_group("chair"):
		if chair.workstation == current_workstation:
			var is_up = chair.animation == &"up"
			var anim_name = "chair_up" if is_up else "chair_down"
			play(&"up" if is_up else &"down")
			var y_offset = -1.0 if is_up else 1.0
			global_position.y = chair.global_position.y + y_offset
			_is_sitting = true
			if _anim_player.has_animation(anim_name):
				_anim_player.play(anim_name)
			return

## Activates or deactivates all computers linked to the current workstation.
func _activate_workstation_computers(active: bool) -> void:
	if current_workstation == null:
		return
	for computer in get_tree().get_nodes_in_group("computer"):
		if computer.workstation == current_workstation:
			if active:
				computer.turn_on()
			else:
				computer.turn_off()
