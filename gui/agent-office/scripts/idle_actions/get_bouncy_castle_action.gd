class_name GetBouncyCastleAction
extends IdleActionHandler

enum Phase { WALKING_TO_CASTLE, BOUNCING }

## Radius (in world-pixels) within which the agent hops around the castle marker.
const BOUNCE_RADIUS := 16.0
## Seconds between re-randomising the hop position. Roughly matches the
## "bouncing" animation length so we swap positions once per bounce.
const HOP_INTERVAL := 0.45

var _phase: Phase = Phase.WALKING_TO_CASTLE
var _target_castle: Node2D = null
var _hop_timer: float = 0.0

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
				_hop_timer = 0.0
				agent.play_named_animation("bouncing")

		Phase.BOUNCING:
			# Make sure the bounce animation keeps playing in case something
			# else (e.g. the chair-code path) nudged it back to standing.
			if agent.get_animation_name() != "bouncing":
				agent.play_named_animation("bouncing")

			_hop_timer -= delta
			if _hop_timer <= 0.0:
				_teleport_to_random_spot()
				_hop_timer = HOP_INTERVAL

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

## Teleports the agent to a random offset within BOUNCE_RADIUS of the castle.
func _teleport_to_random_spot() -> void:
	if _target_castle == null or not is_instance_valid(_target_castle):
		return
	var offset = Vector2(
		randf_range(-BOUNCE_RADIUS, BOUNCE_RADIUS),
		randf_range(-BOUNCE_RADIUS, BOUNCE_RADIUS)
	)
	var target = _target_castle.global_position + offset
	# Snap to the navigation mesh so we don't land on a wall
	var map_rid = agent.navigation_agent.get_navigation_map()
	agent.global_position = NavigationServer2D.map_get_closest_point(map_rid, target)
