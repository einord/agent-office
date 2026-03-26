extends Control

## Main scene controller that connects Game with UI overlays.

@onready var _game: Node2D = $AspectRatioContainer/SubViewportContainer/SubViewport/Game
@onready var _user_stats_overlay: PanelContainer = $UILayer/TopRightPanels/UserStatsOverlay
@onready var _leaderboard_overlay: PanelContainer = $UILayer/TopRightPanels/LeaderboardOverlay
@onready var _viewer_count: PanelContainer = $UILayer/ViewerCount

func _ready() -> void:
	# Connect overlays to the game
	if _game != null and _user_stats_overlay != null:
		_game.set_user_stats_overlay(_user_stats_overlay)
	else:
		if _game == null:
			push_error("Main: Could not find Game node")
		if _user_stats_overlay == null:
			push_error("Main: Could not find UserStatsOverlay node")

	if _game != null and _leaderboard_overlay != null:
		_game.set_leaderboard_overlay(_leaderboard_overlay)
	else:
		if _leaderboard_overlay == null:
			push_error("Main: Could not find LeaderboardOverlay node")

	if _game != null and _viewer_count != null:
		_game.set_viewer_count_overlay(_viewer_count)
