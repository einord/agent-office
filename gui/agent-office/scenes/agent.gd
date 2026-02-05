extends AnimatedSprite2D

enum AgentState { WORKING, IDLE, LEAVING }

@export var movement_speed: float = 25.0
@export var random_range: Vector2 = Vector2(200, 200)  # Område för slumpmässiga positioner
@export var idle_wait_min: float = 5.0  # Minimum wait time in idle state (seconds)
@export var idle_wait_max: float = 10.0  # Maximum wait time in idle state (seconds)
@export var exit_wait_time: float = 2.0  # Time to wait at exit before despawning (seconds)
@onready var navigation_agent: NavigationAgent2D = get_node("NavigationAgent2D")
@onready var _anim_player: AnimationPlayer = $AnimationPlayer
var _name_label: Label = null
var _ui_layer: Control = null
var movement_delta: float
var current_state: AgentState = AgentState.IDLE
var _idle_timer: float = 0.0
var _is_idle_waiting: bool = false
var _exit_timer: float = 0.0
var _is_exit_waiting: bool = false
var external_id: String = ""
var display_name: String = ""
var user_name: String = ""

func _ready() -> void:
	navigation_agent.velocity_computed.connect(Callable(_on_velocity_computed))
	_setup_name_label()
	# Listen for DPI changes to update label font size
	DisplayManager.dpi_scale_changed.connect(_on_dpi_scale_changed)
	# Vänta en frame så att navigationskartan hinner synkroniseras
	await get_tree().physics_frame
	change_state(AgentState.IDLE)

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
		# Use DPI-scaled font size for proper display on high-density screens
		label_settings.font_size = DisplayManager.get_scaled_font_size(32)
		label_settings.outline_color = Color.BLACK
		label_settings.outline_size = DisplayManager.get_scaled_size(8)
		_name_label.label_settings = label_settings

	_ui_layer.add_child(_name_label)

## Returns the formatted label text with display name and optional user name.
func _get_label_text() -> String:
	var name_text = display_name if display_name != "" else "Agent 007"
	if user_name != "":
		return "%s (%s)" % [name_text, user_name]
	return name_text

## Called when DPI scale changes to update label font size dynamically.
func _on_dpi_scale_changed(_new_scale: float) -> void:
	if _name_label == null or _name_label.label_settings == null:
		return
	# Update font size and outline size with new DPI scale
	_name_label.label_settings.font_size = DisplayManager.get_scaled_font_size(32)
	_name_label.label_settings.outline_size = DisplayManager.get_scaled_size(8)

func _exit_tree() -> void:
	# Disconnect DPI change signal
	if DisplayManager.dpi_scale_changed.is_connected(_on_dpi_scale_changed):
		DisplayManager.dpi_scale_changed.disconnect(_on_dpi_scale_changed)
	# Clean up the label when agent is removed
	if _name_label and is_instance_valid(_name_label):
		_name_label.queue_free()

func set_movement_target(movement_target: Vector2):
	navigation_agent.set_target_position(movement_target)

## Sets the sprite frames for this agent. Call this right after instantiation.
func set_sprite_variant(frames: SpriteFrames) -> void:
	sprite_frames = frames

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
	match state:
		AgentState.IDLE:
			_idle_timer = 0.0
			_is_idle_waiting = false
		AgentState.LEAVING:
			_exit_timer = 0.0
			_is_exit_waiting = false

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
	var final_pos = screen_pos + label_offset - Vector2(_name_label.size.x / 2, 0)
	_name_label.position = final_pos.round()

func _physics_process(delta):
	# Do not query when the map has never synchronized and is empty.
	var map_id = navigation_agent.get_navigation_map()
	var iteration = NavigationServer2D.map_get_iteration_id(map_id)
	if iteration == 0:
		return

	if navigation_agent.is_navigation_finished():
		# Play standing animation when not moving
		if _anim_player.current_animation != "standing":
			_anim_player.play("standing")

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

	# Play walking animation when moving
	if safe_velocity.length() > 0.1:
		if _anim_player.current_animation != "walking":
			_anim_player.play("walking")
	else:
		if _anim_player.current_animation != "standing":
			_anim_player.play("standing")

	global_position = global_position.move_toward(global_position + safe_velocity, movement_delta)
