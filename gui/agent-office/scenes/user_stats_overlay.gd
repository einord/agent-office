extends PanelContainer

## Displays user statistics overlay in the top-right corner.
## Shows active users with their session and agent counts.
## Dynamically scales based on window size.

@onready var _stats_label: Label = $MarginContainer/StatsLabel
@onready var _margin_container: MarginContainer = $MarginContainer

## Active indicator (green circle)
const ACTIVE_INDICATOR := "●"
## Inactive indicator (gray circle)
const INACTIVE_INDICATOR := "○"

## Pixel-perfect font sizes (Axolotl font works best at multiples of 16)
const FONT_SIZES := [16, 32, 64]
const BASE_MARGIN := 16
const BASE_WINDOW_WIDTH := 1200.0

var _label_settings: LabelSettings

func _ready() -> void:
	# Create our own LabelSettings so we can modify font_size dynamically
	_label_settings = LabelSettings.new()
	var font = load("res://assets/fonts/Axolotl.ttf")
	if font:
		_label_settings.font = font
	_label_settings.font_size = 32
	_label_settings.font_color = Color(0.15, 0.12, 0.1, 1.0)  # Dark brown text
	_label_settings.outline_size = 0  # No outline on light background

	if _stats_label:
		_stats_label.label_settings = _label_settings

	# Connect to window resize
	get_tree().root.size_changed.connect(_on_window_resized)
	_on_window_resized()

func _on_window_resized() -> void:
	var window_size = get_viewport().get_visible_rect().size
	var scale_factor = window_size.x / BASE_WINDOW_WIDTH

	# Pick pixel-perfect font size based on window width
	var font_size: int
	var outline_size: int
	if scale_factor < 0.6:
		font_size = 16
		outline_size = 4
	elif scale_factor < 1.3:
		font_size = 32
		outline_size = 8
	else:
		font_size = 64
		outline_size = 16

	if _label_settings:
		_label_settings.font_size = font_size
		_label_settings.outline_size = outline_size

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
	if _stats_label == null:
		return

	var users = data.get("users", [])
	if users.is_empty():
		_stats_label.text = "No users"
		return

	var lines: Array[String] = []

	for user in users:
		var display_name = user.get("displayName", "Unknown")
		var session_count = user.get("sessionCount", 0)
		var agent_count = user.get("agentCount", 0)
		var is_active = user.get("isActive", false)

		# Format: ● Name     2s  4a
		var indicator = ACTIVE_INDICATOR if is_active else INACTIVE_INDICATOR
		var line = "%s %s  %ds  %da" % [indicator, display_name, session_count, agent_count]
		lines.append(line)

	_stats_label.text = "\n".join(lines)
