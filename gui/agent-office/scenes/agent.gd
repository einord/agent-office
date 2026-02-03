extends AnimatedSprite2D

@export var movement_speed: float = 25.0
@export var random_range: Vector2 = Vector2(200, 200)  # Område för slumpmässiga positioner
@onready var navigation_agent: NavigationAgent2D = get_node("NavigationAgent2D")
var movement_delta: float

func _ready() -> void:
	navigation_agent.velocity_computed.connect(Callable(_on_velocity_computed))
	# Vänta en frame så att navigationskartan hinner synkroniseras
	await get_tree().physics_frame
	_set_random_target()

func set_movement_target(movement_target: Vector2):
	navigation_agent.set_target_position(movement_target)

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

func _physics_process(delta):
	# Do not query when the map has never synchronized and is empty.
	var map_id = navigation_agent.get_navigation_map()
	var iteration = NavigationServer2D.map_get_iteration_id(map_id)
	if iteration == 0:
		return
	if navigation_agent.is_navigation_finished():
		_set_random_target()
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
