extends Node

## Path to the floor items save file.
const SAVE_PATH := "user://floor_items.json"

## Cached floor items data.
var _items: Array = []

func _ready() -> void:
	_load_from_file()

## Saves a dropped item to persistent storage.
func save_item(type: String, pos: Vector2, color: Color = Color.WHITE) -> void:
	_items.append({
		"type": type,
		"x": pos.x,
		"y": pos.y,
		"color": color.to_html(),
		"dropped_at": Time.get_unix_time_from_system()
	})
	_write_to_file()

## Removes expired items older than max_age_seconds.
func remove_expired(max_age_seconds: float) -> void:
	var now = Time.get_unix_time_from_system()
	var filtered: Array = []
	for item in _items:
		if now - item.get("dropped_at", 0) < max_age_seconds:
			filtered.append(item)
	_items = filtered
	_write_to_file()

## Returns all saved floor items.
func get_all_items() -> Array:
	return _items.duplicate()

## Removes the item closest to the given position (within 2px tolerance).
func remove_item_at(pos: Vector2) -> void:
	var best_index := -1
	var best_dist := 2.0
	for i in range(_items.size()):
		var item = _items[i]
		var item_pos = Vector2(item.get("x", 0), item.get("y", 0))
		var dist = pos.distance_to(item_pos)
		if dist < best_dist:
			best_dist = dist
			best_index = i
	if best_index >= 0:
		_items.remove_at(best_index)
		_write_to_file()

## Writes items array to the save file.
func _write_to_file() -> void:
	var file = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(_items))

## Loads items array from the save file.
func _load_from_file() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		_items = []
		return
	var file = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		_items = []
		return
	var content = file.get_as_text()
	var json = JSON.new()
	if json.parse(content) == OK:
		var data = json.get_data()
		if data is Array:
			_items = data
		else:
			_items = []
	else:
		_items = []
