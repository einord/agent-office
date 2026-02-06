extends AnimatedSprite2D

enum VacuumState { IDLE, CLEANING, RETURNING }

const MOVEMENT_SPEED := 20.0
const PICKUP_PAUSE := 1.0

var _state: VacuumState = VacuumState.IDLE
var _charge_position: Vector2
var _current_target: Node2D = null
var _pause_timer: float = 0.0

@onready var _nav_agent: NavigationAgent2D = $NavigationAgent2D

func _ready() -> void:
	_charge_position = global_position
	_nav_agent.max_speed = MOVEMENT_SPEED

## Starts the cleaning cycle by collecting all floor cans.
func start_cleaning() -> void:
	var first = _find_next_can()
	if first == null:
		return
	_current_target = first
	_state = VacuumState.CLEANING
	_nav_agent.target_position = _current_target.global_position
	play(&"down")

func _physics_process(delta: float) -> void:
	if _state == VacuumState.IDLE:
		return

	if _pause_timer > 0.0:
		_pause_timer -= delta
		return

	if _nav_agent.is_navigation_finished():
		match _state:
			VacuumState.CLEANING:
				_consume_current_target()
			VacuumState.RETURNING:
				_finish_cleaning()
		return

	var next_pos = _nav_agent.get_next_path_position()
	var direction = global_position.direction_to(next_pos)
	var velocity = direction * MOVEMENT_SPEED

	# Flip horizontally based on x direction
	flip_h = velocity.x < 0
	# Play up/down animation based on y direction
	if velocity.y < 0:
		play(&"up")
	else:
		play(&"down")

	global_position = global_position.move_toward(next_pos, MOVEMENT_SPEED * delta)

## Removes the current target can and navigates to the next one.
func _consume_current_target() -> void:
	if _current_target != null and is_instance_valid(_current_target):
		FloorItemStore.remove_item_at(_current_target.global_position)
		_current_target.queue_free()
		_pause_timer = PICKUP_PAUSE
	_current_target = null

	# Rescan for any cans on the floor (including newly dropped ones)
	var next = _find_next_can()
	if next != null:
		_current_target = next
		_nav_agent.target_position = _current_target.global_position
	else:
		# All cans collected, return to charging station
		_state = VacuumState.RETURNING
		_nav_agent.target_position = _charge_position

## Finds the nearest floor can, or null if none exist.
func _find_next_can() -> Node2D:
	var best: Node2D = null
	var best_dist := INF
	for node in get_tree().get_nodes_in_group("floor_item"):
		if node is AnimatedSprite2D and node.has_method("drop") and node.current_state == 1:
			var dist = global_position.distance_squared_to(node.global_position)
			if dist < best_dist:
				best_dist = dist
				best = node
	return best

## Finishes the cleaning cycle and returns to idle.
func _finish_cleaning() -> void:
	FloorItemStore.clear_all()
	_state = VacuumState.IDLE
