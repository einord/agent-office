extends AnimatedSprite2D

@export var movement_speed: float = 50.0
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
	var random_position = Vector2(
		randf_range(-random_range.x / 2, random_range.x / 2),
		randf_range(-random_range.y / 2, random_range.y / 2)
	)
	set_movement_target(global_position + random_position)

func _physics_process(delta):
	# Do not query when the map has never synchronized and is empty.
	var map_id = navigation_agent.get_navigation_map()
	var iteration = NavigationServer2D.map_get_iteration_id(map_id)
	if iteration == 0:
		print("Navigation map not ready, iteration: ", iteration)
		return
	if navigation_agent.is_navigation_finished():
		print("Navigation finished, setting new target")
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
