class_name GetDrinkAction
extends IdleActionHandler

enum Phase { WALKING_TO_MACHINE, PICKING_UP, WANDERING }

## Preloaded can scene for spawning drink cans.
const CAN_SCENE = preload("res://scenes/items/can.tscn")

## Time spent at the vending machine picking up a drink.
const PICKUP_DURATION := 1.5
## Minimum wander time between break area targets.
const WANDER_WAIT_MIN := 4.0
## Maximum wander time between break area targets.
const WANDER_WAIT_MAX := 8.0

var _phase: Phase = Phase.WALKING_TO_MACHINE
var _pickup_timer: float = 0.0
var _wander_timer: float = 0.0
var _is_wander_waiting: bool = false
var _can_instance: Node2D = null
var _target_machine: Node2D = null

## Starts the get_drink action by navigating to a vending machine.
func start(p_agent: Node2D) -> void:
	super.start(p_agent)
	_phase = Phase.WALKING_TO_MACHINE
	_navigate_to_vending_machine()

## Called each physics frame to progress the action phases.
func physics_process(delta: float) -> void:
	if not is_running or agent == null or not is_instance_valid(agent):
		return

	match _phase:
		Phase.WALKING_TO_MACHINE:
			if agent.navigation_agent.is_navigation_finished():
				_phase = Phase.PICKING_UP
				_pickup_timer = PICKUP_DURATION

		Phase.PICKING_UP:
			_pickup_timer -= delta
			if _pickup_timer <= 0.0:
				_spawn_can()
				_phase = Phase.WANDERING
				_is_wander_waiting = false
				_set_wander_target()

		Phase.WANDERING:
			if agent.navigation_agent.is_navigation_finished():
				if not _is_wander_waiting:
					_is_wander_waiting = true
					_wander_timer = randf_range(WANDER_WAIT_MIN, WANDER_WAIT_MAX)
				else:
					_wander_timer -= delta
					if _wander_timer <= 0.0:
						_is_wander_waiting = false
						_set_wander_target()

## Interrupts the action, dropping any held can.
func interrupt() -> void:
	if _can_instance != null and is_instance_valid(_can_instance):
		_can_instance.drop(agent.global_position)
		_can_instance = null
	super.interrupt()

## Navigates the agent to a random vending machine marker.
func _navigate_to_vending_machine() -> void:
	var machines = agent.get_tree().get_nodes_in_group("vending_machine")
	if machines.size() > 0:
		_target_machine = machines[randi() % machines.size()]
		agent.set_movement_target(_target_machine.global_position)
	else:
		# No vending machine found, wander to break area instead
		_phase = Phase.WANDERING
		_set_wander_target()

## Spawns a can and attaches it to the agent.
func _spawn_can() -> void:
	_can_instance = CAN_SCENE.instantiate()
	agent.add_child(_can_instance)
	_can_instance.hold(agent)

## Sets a random break area as the next wander target.
func _set_wander_target() -> void:
	var break_areas = agent.get_tree().get_nodes_in_group("break_area")
	if break_areas.size() > 0:
		var target_node = break_areas[randi() % break_areas.size()]
		var random_offset = Vector2(
			randf_range(-20.0, 20.0),
			randf_range(-20.0, 20.0)
		)
		var target = target_node.global_position + random_offset
		var map_rid = agent.navigation_agent.get_navigation_map()
		var closest_point = NavigationServer2D.map_get_closest_point(map_rid, target)
		agent.set_movement_target(closest_point)
