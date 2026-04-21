extends Control

## Main scene controller that connects Game with UI overlays.

@onready var _game: Node2D = $AspectRatioContainer/SubViewportContainer/SubViewport/Game
@onready var _leaderboard_overlay: PanelContainer = $UILayer/TopRightPanels/LeaderboardOverlay
@onready var _download_link: PanelContainer = $UILayer/DownloadLink

func _ready() -> void:
	if _game == null:
		push_error("Main: Could not find Game node")
		return

	if _leaderboard_overlay != null:
		_game.set_leaderboard_overlay(_leaderboard_overlay)
	else:
		push_error("Main: Could not find LeaderboardOverlay node")

	if _download_link != null:
		_game.set_download_link_overlay(_download_link)
		# Start hidden — revealed when sync_complete supplies a URL (event mode only)
		_download_link.visible = false
