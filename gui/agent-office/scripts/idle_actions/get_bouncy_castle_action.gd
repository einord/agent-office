class_name GetBouncyCastleAction
extends IdleActionHandler

enum Phase { WALKING_TO_CASTLE, BOUNCING }

## Radius (in world-pixels) within which the agent hops around the castle marker.
const BOUNCE_RADIUS := 16.0
## How long to linger at a hop destination before picking the next one.
## Small value keeps the agent moving; larger values make them pause.
const LINGER_AT_SPOT := 0.3

var _phase: Phase = Phase.WALKING_TO_CASTLE
var _target_castle: Node2D = null
var _linger_timer: float = 0.0

## Starts the get_bouncy_castle action by walking to a bouncy castle.
func start(p_agent: Node2D) -> void:
	super.start(p_agent)
	_phase = Phase.WALKING_TO_CASTLE
	_navigate_to_castle()

## Called each physics frame to progress the action phases.
func physics_process(delta: float) -> void:
	if not is_running or agent == null or not is_instance_valid(agent):
		return

	match _phase:
		Phase.WALKING_TO_CASTLE:
			if agent.navigation_agent.is_navigation_finished():
				_phase = Phase.BOUNCING
				_linger_timer = 0.0
				agent.play_named_animation("bouncing")

		Phase.BOUNCING:
			# Keep the bounce animation playing in case something else
			# nudged it back (it survives walking-anim overrides because
			# agent.gd checks for "bouncing" before switching).
			if agent.get_animation_name() != "bouncing":
				agent.play_named_animation("bouncing")

			# When we arrive at the current hop target, wait a short
			# moment then pick the next one — gives a visible "land,
			# then take off" rhythm while still letting the agent
			# navigate (not teleport) between spots.
			if agent.navigation_agent.is_navigation_finished():
				_linger_timer -= delta
				if _linger_timer <= 0.0:
					_move_to_random_spot()
					_linger_timer = LINGER_AT_SPOT

## Interrupts the action and restores the agent's idle animation.
func interrupt() -> void:
	if agent != null and is_instance_valid(agent):
		agent.play_named_animation("standing")
	super.interrupt()

## Walks the agent to a random bouncy castle marker.
func _navigate_to_castle() -> void:
	var castles = agent.get_tree().get_nodes_in_group("bouncy_castle")
	if castles.size() > 0:
		_target_castle = castles[randi() % castles.size()]
		agent.set_movement_target(_target_castle.global_position)
	else:
		# No castle — bail out by marking the action as not running, which
		# causes the agent to fall through to default idle behaviour.
		is_running = false

## Asks the agent to navigate to a random offset within BOUNCE_RADIUS
## of the castle. The agent keeps the bouncing animation on while moving.
func _move_to_random_spot() -> void:
	if _target_castle == null or not is_instance_valid(_target_castle):
		return
	var offset = Vector2(
		randf_range(-BOUNCE_RADIUS, BOUNCE_RADIUS),
		randf_range(-BOUNCE_RADIUS, BOUNCE_RADIUS)
	)
	var target = _target_castle.global_position + offset
	# Snap to the nav mesh so we don't try to walk into a wall
	var map_rid = agent.navigation_agent.get_navigation_map()
	var closest = NavigationServer2D.map_get_closest_point(map_rid, target)
	agent.set_movement_target(closest)
