extends AnimatedSprite2D

## Path to the workstation Marker2D this chair belongs to.
@export var workstation_path: NodePath

## Resolved workstation node reference.
var workstation: Marker2D = null

func _ready() -> void:
	if workstation_path:
		workstation = get_node(workstation_path) as Marker2D
	add_to_group("chair")
