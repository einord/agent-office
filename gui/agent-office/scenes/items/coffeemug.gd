extends AnimatedSprite2D

enum MugState { HELD, ON_FLOOR }

## How long a dropped mug stays on the floor before cleanup (seconds).
const FLOOR_LIFETIME := 7200.0

var current_state: MugState = MugState.HELD
var _floor_timer: float = 0.0
var _held_by_agent: Node2D = null

func _ready() -> void:
	add_to_group("floor_item")
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

func _process(delta: float) -> void:
	match current_state:
		MugState.HELD:
			if _held_by_agent != null and is_instance_valid(_held_by_agent):
				var hold_offset = _held_by_agent.get_hold_offset()
				global_position = _held_by_agent.global_position
				offset = hold_offset
		MugState.ON_FLOOR:
			_floor_timer += delta
			if _floor_timer >= FLOOR_LIFETIME:
				FloorItemStore.remove_item_at(global_position)
				queue_free()

## Attaches the mug to an agent's hand.
func hold(agent: Node2D) -> void:
	current_state = MugState.HELD
	_held_by_agent = agent
	play(&"default")

## Drops the mug at the given position onto the floor.
func drop(drop_position: Vector2) -> void:
	current_state = MugState.ON_FLOOR
	_held_by_agent = null
	_floor_timer = 0.0

	# Reparent to FloorItems container
	var floor_items = _get_floor_items_container()
	if floor_items and get_parent() != floor_items:
		if get_parent():
			get_parent().remove_child(self)
		floor_items.add_child(self)

	global_position = drop_position
	play(&"default")
	FloorItemStore.save_item("coffeemug", drop_position)

## Spawns the mug directly on the floor (for restoring saved items).
func spawn_on_floor(floor_position: Vector2) -> void:
	current_state = MugState.ON_FLOOR
	_held_by_agent = null
	_floor_timer = 0.0
	global_position = floor_position
	play(&"default")

## Returns the FloorItems container node from the tilemap.
func _get_floor_items_container() -> Node:
	var tilemap = get_tree().root.get_node_or_null("Main/AspectRatioContainer/SubViewportContainer/SubViewport/Game/Tilemap")
	if tilemap:
		return tilemap.get_node_or_null("FloorItems")
	return null
