extends AnimatedSprite2D

## Which computer type sprite frames to use (assigned per instance).
@export var sprite_frames_resource: SpriteFrames
## Path to the workstation Marker2D this computer belongs to.
@export var workstation_path: NodePath

## Resolved workstation node reference.
var workstation: Marker2D = null

var _active_count: int = 0

func _ready() -> void:
	if sprite_frames_resource:
		sprite_frames = sprite_frames_resource
	if workstation_path:
		workstation = get_node(workstation_path) as Marker2D
	play("off")
	add_to_group("computer")

## <summary>
## Activates this computer screen. Uses reference counting to support
## multiple agents at the same workstation.
## </summary>
func turn_on() -> void:
	_active_count += 1
	if _active_count == 1:
		play("on")

## <summary>
## Deactivates this computer screen. Only switches to "off" when no
## agents remain at the workstation (reference count reaches zero).
## </summary>
func turn_off() -> void:
	_active_count = max(_active_count - 1, 0)
	if _active_count == 0:
		play("off")
