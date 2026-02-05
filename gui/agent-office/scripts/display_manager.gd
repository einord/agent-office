extends Node
## Centralized display manager for DPI-aware font scaling.
## Registered as autoload "DisplayManager" for global access.

## Reference DPI values:
## - 96 DPI: Standard Windows desktop
## - 72 DPI: Standard macOS desktop
## - 160 DPI: Android mdpi baseline
const REFERENCE_DPI: float = 96.0

## Minimum font size for pixel-perfect font (base size)
const MIN_FONT_SIZE: int = 16

## Minimum and maximum scale factors to prevent extreme values
const MIN_SCALE: float = 0.5
const MAX_SCALE: float = 4.0

## Cached DPI scale factor (calculated once at startup)
var _dpi_scale: float = 1.0

## Signal emitted when DPI scale changes (e.g., window moved to different monitor)
signal dpi_scale_changed(new_scale: float)

func _ready() -> void:
	_calculate_dpi_scale()
	# Recalculate if window is moved (could be to different monitor)
	get_tree().root.size_changed.connect(_on_window_size_changed)

## Calculates the DPI scale factor based on screen pixel density.
func _calculate_dpi_scale() -> void:
	var current_screen := DisplayServer.window_get_current_screen()
	var screen_dpi = DisplayServer.screen_get_dpi(current_screen)

	# Fallback for platforms that don't report DPI (returns 0 or -1)
	if screen_dpi <= 0:
		screen_dpi = REFERENCE_DPI
		push_warning("DisplayManager: Could not detect screen DPI, using default: %d" % int(REFERENCE_DPI))

	var new_scale = clampf(screen_dpi / REFERENCE_DPI, MIN_SCALE, MAX_SCALE)

	if not is_equal_approx(_dpi_scale, new_scale):
		_dpi_scale = new_scale
		print("DisplayManager: Screen DPI = %d, Scale factor = %.2f" % [int(screen_dpi), _dpi_scale])
		dpi_scale_changed.emit(_dpi_scale)

## Returns the current DPI scale factor.
func get_dpi_scale() -> float:
	return _dpi_scale

## Returns a font size scaled by the DPI factor.
## For pixel-perfect fonts, ensures the result is never smaller than 16px
## and always in multiples of the base size (16px, 32px, 64px).
## base_size: The base font size at 96 DPI
## Returns the scaled font size as an integer
func get_scaled_font_size(base_size: int) -> int:
	var scaled = int(round(base_size * _dpi_scale))
	# Ensure minimum size and snap to nearest valid font size (16, 32, 64, etc.)
	if scaled < MIN_FONT_SIZE:
		return MIN_FONT_SIZE
	# Round down to nearest power-of-2 multiple of 16 for pixel-perfect rendering
	var power = int(floor(log(float(scaled) / MIN_FONT_SIZE) / log(2.0)))
	return MIN_FONT_SIZE * int(pow(2, max(0, power)))

## Returns a dimension (e.g., outline size, padding) scaled by the DPI factor.
## base_size: The base dimension at 96 DPI
## Returns the scaled dimension as an integer
func get_scaled_size(base_size: int) -> int:
	return int(round(base_size * _dpi_scale))

## Called when window size changes - may indicate monitor change
func _on_window_size_changed() -> void:
	# Recalculate DPI in case window moved to a different monitor
	_calculate_dpi_scale()
