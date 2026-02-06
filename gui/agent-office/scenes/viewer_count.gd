extends PanelContainer

## Displays the number of connected Godot viewers with an eye icon.

@onready var _label: Label = $MarginContainer/HBox/Label
@onready var _eye_icon: TextureRect = $MarginContainer/HBox/EyeIcon

const BASE_WINDOW_WIDTH := 1200.0
const TEXT_COLOR := Color(0.15, 0.12, 0.1, 1.0)

var _font: Font
var _viewer_count: int = 0

func _ready() -> void:
	_font = load("res://assets/fonts/Axolotl.ttf")
	get_tree().root.size_changed.connect(_on_window_resized)
	_on_window_resized()
	_update_display()

func _on_window_resized() -> void:
	if _label == null or _font == null:
		return
	var scale_factor = get_viewport().get_visible_rect().size.x / BASE_WINDOW_WIDTH
	var font_size = _get_font_size_for_scale(scale_factor)
	var settings = LabelSettings.new()
	settings.font = _font
	settings.font_size = font_size
	settings.font_color = TEXT_COLOR
	_label.label_settings = settings
	# Scale eye icon to match text height
	if _eye_icon:
		_eye_icon.custom_minimum_size = Vector2(font_size / 2.0, font_size / 2.0)

func _get_font_size_for_scale(scale: float) -> int:
	if scale < 0.6:
		return 16
	if scale < 1.3:
		return 32
	return 64

## <summary>
## Updates the viewer count from user_stats totals data.
## </summary>
func update_viewer_count(count: int) -> void:
	_viewer_count = count
	_update_display()

func _update_display() -> void:
	if _label == null:
		return
	_label.text = "%d" % _viewer_count
