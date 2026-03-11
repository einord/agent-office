extends PanelContainer

## Displays a token usage leaderboard overlay with per-user output token rankings.
## Supports collapsed (total summary) and expanded (per-user ranked list) views.

@onready var _stats_label: RichTextLabel = $MarginContainer/ContentContainer/StatsLabel
@onready var _stats_grid: GridContainer = $MarginContainer/ContentContainer/StatsGrid
@onready var _margin_container: MarginContainer = $MarginContainer

const BASE_MARGIN := 8
const BASE_WINDOW_WIDTH := 1200.0
const TEXT_COLOR := Color(0.15, 0.12, 0.1, 1.0)
const DIM_COLOR := Color(0.4, 0.36, 0.32, 1.0)

var _font: Font
var _is_expanded: bool = false
var _current_users: Array = []
var _current_font_size: int = 32

func _ready() -> void:
	_font = load("res://assets/fonts/Axolotl.ttf")
	if _font == null:
		push_warning("LeaderboardOverlay: Failed to load font at 'res://assets/fonts/Axolotl.ttf'")
	get_tree().root.size_changed.connect(_on_window_resized)
	_on_window_resized()
	_update_display()

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

## Updates the leaderboard with user stats data from the user_stats payload.
func update_leaderboard(data: Dictionary) -> void:
	_current_users = data.get("users", [])
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

	var total_tokens: int = 0
	var total_per_hour: int = 0
	var total_spawns: int = 0
	var total_sycophancy: int = 0
	for user in _current_users:
		total_tokens += int(user.get("totalOutputTokens", 0))
		total_per_hour += int(user.get("outputTokensPerHour", 0))
		total_spawns += int(user.get("dailyAgentSpawns", 0))
		total_sycophancy += int(user.get("dailySycophancyCount", 0))

	if total_tokens > 0 or total_spawns > 0:
		var parts: Array[String] = [_format_tokens(total_tokens)]
		if total_per_hour > 0:
			parts.append(_format_tokens_per_hour(total_per_hour))
		parts.append("%da" % total_spawns)
		if total_sycophancy > 0:
			parts.append("%dar" % total_sycophancy)
		_stats_label.text = "  ".join(parts) + " \u25BC"
	else:
		_stats_label.text = "-  \u25BC"

func _render_expanded() -> void:
	for child in _stats_grid.get_children():
		child.queue_free()

	# Filter users with tokens and sort by totalOutputTokens descending
	var users_with_tokens: Array = []
	for user in _current_users:
		var tokens = int(user.get("totalOutputTokens", 0))
		if tokens > 0:
			users_with_tokens.append(user)

	if users_with_tokens.is_empty():
		_stats_label.visible = true
		_stats_grid.visible = false
		_stats_label.text = "No tokens yet"
		return

	users_with_tokens.sort_custom(func(a, b):
		return int(a.get("totalOutputTokens", 0)) > int(b.get("totalOutputTokens", 0))
	)

	_stats_label.visible = false
	_stats_grid.visible = true
	_stats_grid.columns = 5

	var rank := 1
	for user in users_with_tokens:
		var display_name = user.get("displayName", "?")
		var output_tokens = int(user.get("totalOutputTokens", 0))
		var tokens_per_hour = int(user.get("outputTokensPerHour", 0))
		var spawns = int(user.get("dailyAgentSpawns", 0))
		var sycophancy = int(user.get("dailySycophancyCount", 0))

		_stats_grid.add_child(_create_grid_label("%d. %s" % [rank, display_name]))
		_stats_grid.add_child(_create_grid_label(_format_tokens(output_tokens)))
		_stats_grid.add_child(_create_grid_label(_format_tokens_per_hour(tokens_per_hour), DIM_COLOR))
		_stats_grid.add_child(_create_grid_label("%da" % spawns, DIM_COLOR))
		_stats_grid.add_child(_create_grid_label("%dar" % sycophancy, DIM_COLOR))
		rank += 1

	# Summary row
	var total_output: int = 0
	var total_per_hour: int = 0
	var total_spawns: int = 0
	var total_sycophancy: int = 0
	for user in users_with_tokens:
		total_output += int(user.get("totalOutputTokens", 0))
		total_per_hour += int(user.get("outputTokensPerHour", 0))
		total_spawns += int(user.get("dailyAgentSpawns", 0))
		total_sycophancy += int(user.get("dailySycophancyCount", 0))

	_stats_grid.add_child(_create_grid_label(""))
	_stats_grid.add_child(_create_grid_label(_format_tokens(total_output)))
	_stats_grid.add_child(_create_grid_label(_format_tokens_per_hour(total_per_hour), DIM_COLOR))
	_stats_grid.add_child(_create_grid_label("%da" % total_spawns, DIM_COLOR))
	_stats_grid.add_child(_create_grid_label("%dar" % total_sycophancy, DIM_COLOR))

## Formats token count for display: <1K raw, >=1K as "1.2K", >=1M as "1.2M"
static func _format_tokens(count: int) -> String:
	if count >= 1_000_000:
		return "%.1fM" % (count / 1_000_000.0)
	elif count >= 1_000:
		return "%.1fK" % (count / 1_000.0)
	else:
		return str(count)

## Formats tokens per hour for display, e.g. "12.3K/h"
static func _format_tokens_per_hour(count: int) -> String:
	if count <= 0:
		return "-/h"
	return _format_tokens(count) + "/h"

func _create_grid_label(text: String, color: Color = TEXT_COLOR) -> Label:
	var label = Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	if _font:
		var settings = LabelSettings.new()
		settings.font = _font
		settings.font_size = _current_font_size
		settings.font_color = color
		label.label_settings = settings

	return label
