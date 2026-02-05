extends PanelContainer

## Displays user statistics overlay with active users, session counts, and agent counts.
## Supports collapsed (summary) and expanded (per-user) views. Scales based on window size.

@onready var _stats_label: RichTextLabel = $MarginContainer/ContentContainer/StatsLabel
@onready var _stats_grid: GridContainer = $MarginContainer/ContentContainer/StatsGrid
@onready var _margin_container: MarginContainer = $MarginContainer

const BASE_MARGIN := 8
const BASE_WINDOW_WIDTH := 1200.0
const TEXT_COLOR := Color(0.15, 0.12, 0.1, 1.0)

var _font: Font
var _is_expanded: bool = false
var _current_data: Dictionary = {}
var _current_font_size: int = 32

func _ready() -> void:
	_font = load("res://assets/fonts/Axolotl.ttf")
	get_tree().root.size_changed.connect(_on_window_resized)
	_on_window_resized()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_is_expanded = not _is_expanded
		_update_display()

func _on_window_resized() -> void:
	var scale_factor = get_viewport().get_visible_rect().size.x / BASE_WINDOW_WIDTH
	_current_font_size = _get_font_size_for_scale(scale_factor)

	if _stats_label and _font:
		_stats_label.add_theme_font_override("normal_font", _font)
		_stats_label.add_theme_font_size_override("normal_font_size", _current_font_size)
		_stats_label.add_theme_color_override("default_color", TEXT_COLOR)

	if _margin_container:
		var h_margin = clampi(int(BASE_MARGIN * scale_factor), 4, 16)
		var v_margin = clampi(int(BASE_MARGIN * scale_factor * 0.5), 2, 8)
		_margin_container.add_theme_constant_override("margin_left", h_margin)
		_margin_container.add_theme_constant_override("margin_right", h_margin)
		_margin_container.add_theme_constant_override("margin_top", 0)
		_margin_container.add_theme_constant_override("margin_bottom", v_margin)

	if _stats_grid:
		_stats_grid.add_theme_constant_override("h_separation", clampi(int(16 * scale_factor), 8, 32))

	if _is_expanded:
		_update_display()

func _get_font_size_for_scale(scale: float) -> int:
	if scale < 0.6:
		return 16
	if scale < 1.3:
		return 32
	return 64

## Updates the overlay with new user stats data containing 'users' array and 'totals' object.
func update_stats(data: Dictionary) -> void:
	_current_data = data
	_update_display()

func _update_display() -> void:
	if _stats_label == null or _stats_grid == null:
		return

	if _is_expanded:
		_render_expanded()
	else:
		_render_collapsed()

func _render_collapsed() -> void:
	_stats_label.visible = true
	_stats_grid.visible = false

	var totals = _current_data.get("totals", {})
	var users = totals.get("activeUsers", 0)
	var sessions = totals.get("totalSessions", 0)
	var agents = totals.get("totalAgents", 0)

	var parts: Array[String] = []
	if users > 0:
		parts.append("%du" % users)
	if sessions > 0:
		parts.append("%ds" % sessions)
	if agents > 0:
		parts.append("%da" % agents)

	_stats_label.text = ("  ".join(parts) if parts.size() > 0 else "-") + "  ▼"

func _render_expanded() -> void:
	for child in _stats_grid.get_children():
		child.queue_free()

	var active_users = _current_data.get("users", []).filter(func(u): return u.get("isActive", false))

	if active_users.is_empty():
		_stats_label.visible = true
		_stats_grid.visible = false
		_stats_label.text = "No active users"
		return

	_stats_label.visible = false
	_stats_grid.visible = true

	for user in active_users:
		var display_name = user.get("displayName", "?")
		var sessions = user.get("sessionCount", 0)
		var agents = user.get("agentCount", 0)

		_stats_grid.add_child(_create_grid_label(display_name))
		_stats_grid.add_child(_create_grid_label(_format_count(sessions, "s")))
		_stats_grid.add_child(_create_grid_label(_format_count(agents, "a")))

func _format_count(count: int, suffix: String) -> String:
	return "%d%s" % [count, suffix] if count > 0 else "-"

func _create_grid_label(text: String) -> Label:
	var label = Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	if _font:
		var settings = LabelSettings.new()
		settings.font = _font
		settings.font_size = _current_font_size
		settings.font_color = TEXT_COLOR
		label.label_settings = settings

	return label
