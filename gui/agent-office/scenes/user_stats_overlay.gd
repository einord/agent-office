extends PanelContainer

## Displays user statistics overlay in the top-right corner.
## Shows active users with their session and agent counts.
## Dynamically scales based on window size.

@onready var _stats_label: RichTextLabel = $MarginContainer/StatsLabel
@onready var _margin_container: MarginContainer = $MarginContainer


## Base values for scaling
const BASE_MARGIN := 16
const BASE_WINDOW_WIDTH := 1200.0

var _font: Font
var _is_expanded: bool = false
var _current_data: Dictionary = {}

func _ready() -> void:
	# Load font for dynamic sizing
	_font = load("res://assets/fonts/Axolotl.ttf")

	# Connect to window resize
	get_tree().root.size_changed.connect(_on_window_resized)
	_on_window_resized()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_is_expanded = not _is_expanded
		_update_display()

func _on_window_resized() -> void:
	var window_size = get_viewport().get_visible_rect().size
	var scale_factor = window_size.x / BASE_WINDOW_WIDTH

	# Pick pixel-perfect font size based on window width
	var font_size: int
	if scale_factor < 0.6:
		font_size = 16
	elif scale_factor < 1.3:
		font_size = 32
	else:
		font_size = 64

	# Apply font settings to RichTextLabel
	if _stats_label and _font:
		_stats_label.add_theme_font_override("normal_font", _font)
		_stats_label.add_theme_font_size_override("normal_font_size", font_size)
		_stats_label.add_theme_color_override("default_color", Color(0.15, 0.12, 0.1, 1.0))

	# Scale margins proportionally
	if _margin_container:
		var margin = int(BASE_MARGIN * scale_factor)
		margin = clampi(margin, 8, 32)
		_margin_container.add_theme_constant_override("margin_left", margin)
		_margin_container.add_theme_constant_override("margin_top", margin)
		_margin_container.add_theme_constant_override("margin_right", margin)
		_margin_container.add_theme_constant_override("margin_bottom", margin)

## Updates the overlay with new user stats data.
## @param data - Dictionary with 'users' array and 'totals' object
func update_stats(data: Dictionary) -> void:
	_current_data = data
	_update_display()

func _update_display() -> void:
	if _stats_label == null:
		return

	if _is_expanded:
		_render_expanded()
	else:
		_render_minimal()

func _render_minimal() -> void:
	var totals = _current_data.get("totals", {})
	var parts: Array[String] = []

	var users = totals.get("activeUsers", 0)
	var sessions = totals.get("totalSessions", 0)
	var agents = totals.get("totalAgents", 0)

	if users > 0:
		parts.append("%du" % users)
	if sessions > 0:
		parts.append("%ds" % sessions)
	if agents > 0:
		parts.append("%da" % agents)

	var text = "  ".join(parts) if parts.size() > 0 else "-"
	_stats_label.text = text + "  ▼"

func _render_expanded() -> void:
	var all_users = _current_data.get("users", [])

	# Filter only active users
	var users: Array = []
	for user in all_users:
		if user.get("isActive", false):
			users.append(user)

	if users.is_empty():
		_stats_label.text = "No active users"
		return

	var lines: Array[String] = []

	# Find longest name for padding
	var max_name_len := 0
	for user in users:
		max_name_len = max(max_name_len, user.get("displayName", "").length())

	for user in users:
		var name = user.get("displayName", "?")
		var sessions = user.get("sessionCount", 0)
		var agents = user.get("agentCount", 0)

		var padded_name = name.rpad(max_name_len)
		var session_str = "%ds" % sessions if sessions > 0 else " -"
		var agent_str = "%da" % agents if agents > 0 else " -"

		lines.append("%s  %s  %s" % [padded_name, session_str, agent_str])

	_stats_label.text = "\n".join(lines)
