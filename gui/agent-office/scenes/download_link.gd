extends PanelContainer

## Displays the download URL for the event client binary.

@onready var _label: Label = $MarginContainer/HBox/Label

const BASE_WINDOW_WIDTH := 1200.0
const TEXT_COLOR := Color(0.15, 0.12, 0.1, 1.0)
const PLACEHOLDER := "Download client: —"

var _font: Font
var _text: String = PLACEHOLDER

func _ready() -> void:
	_font = load("res://assets/fonts/Axolotl.ttf")
	get_tree().root.size_changed.connect(_on_window_resized)
	_on_window_resized()
	_update_display()

func _on_window_resized() -> void:
	if _label == null or _font == null:
		return
	# var scale_factor = get_viewport().get_visible_rect().size.x / BASE_WINDOW_WIDTH
	# var font_size = _get_font_size_for_scale(scale_factor)
	# var settings = LabelSettings.new()
	# settings.font = _font
	# settings.font_size = font_size
	# settings.font_color = TEXT_COLOR
	# _label.label_settings = settings

# func _get_font_size_for_scale(scale: float) -> int:
# 	if scale < 0.6:
# 		return 16
# 	if scale < 1.3:
# 		return 32
# 	return 64

## <summary>
## Updates the displayed download URL. Hides the panel if url is empty.
## </summary>
func update_url(url: String) -> void:
	if url.is_empty():
		visible = false
		return
	visible = true
	_text = "Download client: %s" % url
	_update_display()

func _update_display() -> void:
	if _label == null:
		return
	_label.text = _text
