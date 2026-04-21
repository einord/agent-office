class_name GetBouncyCastleAction
extends IdleActionHandler

enum Phase { WALKING_TO_CASTLE, BOUNCING }

## Radius (in world-pixels) within which the agent hops around the castle marker.
const BOUNCE_RADIUS := 16.0

var _phase: Phase = Phase.WALKING_TO_CASTLE
var _target_castle: Node2D = null
## Last observed playhead position of the "bouncing" animation — used to detect
## when the animation loops (position wraps back) so we can commit to one hop
## at a time instead of turning mid-air.
var _last_anim_pos: float = 0.0

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
				agent.play_named_animation("bouncing")
				_last_anim_pos = agent.get_animation_position()
				# Kick off the first hop immediately so the agent doesn't
				# just stand still until the animation loops back.
				_move_to_random_spot()

		Phase.BOUNCING:
			# Keep the bounce animation playing in case something else
			# nudged it back (it survives walking-anim overrides because
			# agent.gd checks for "bouncing" before switching).
			if agent.get_animation_name() != "bouncing":
				agent.play_named_animation("bouncing")
				_last_anim_pos = agent.get_animation_position()

			# Commit to the current hop until the animation finishes or
			# loops back to the start — that way the agent never changes
			# direction mid-air. `current_animation_position` wraps back
			# toward 0 on loop, so a drop in value marks a cycle boundary.
			var current_pos: float = agent.get_animation_position()
			if current_pos < _last_anim_pos:
				_move_to_random_spot()
			_last_anim_pos = current_pos

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
