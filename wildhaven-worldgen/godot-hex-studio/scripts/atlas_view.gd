extends Control
## Atlas geográfico 2D do Codex. Não modifica os dados ambientais.
signal region_selected(region_id: String)

const BIOME_COLORS := [
	Color("#19334a"), Color("#437a59"), Color("#22634e"), Color("#57777a"),
	Color("#a5b6ad"), Color("#c0a35e"), Color("#92ac70"), Color("#c39e75"),
	Color("#5d7551"), Color("#bfc9cb"), Color("#389384"), Color("#63b5ae"),
	Color("#a793ca"), Color("#776c82"), Color("#595553"), Color("#b0c6c8")
]

var regions: Array = []
var progress: Dictionary = {}
var selected_id := "H_5_7"
var world_size := Vector2(6400000.0, 8000000.0)
var biome_image: Texture2D
var _zoom := 1.0
var _pan := Vector2.ZERO
var _dragging := false
var _drag_length := 0.0
var _last_cursor := Vector2.ZERO

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	resized.connect(queue_redraw)

func set_world(data: Dictionary, texture: Texture2D = null) -> void:
	regions = data.get("regions", [])
	var extent: Array = data.get("world_extent_m", [6400000, 8000000])
	world_size = Vector2(float(extent[0]), float(extent[1]))
	biome_image = texture
	_zoom = 1.0
	_pan = Vector2.ZERO
	queue_redraw()

func set_statuses(statuses: Dictionary) -> void:
	progress = statuses
	queue_redraw()

func select_region(region_id: String) -> void:
	selected_id = region_id
	queue_redraw()

func focus_selected() -> void:
	for region in regions:
		if str(region.get("id", "")) == selected_id:
			var xy: Array = region.get("center_m", [0, 0])
			_zoom = 3.2
			_pan = size * 0.5 - _view_point(Vector2(float(xy[0]), float(xy[1])), false)
			queue_redraw()
			return

func reset_view() -> void:
	_zoom = 1.0
	_pan = Vector2.ZERO
	queue_redraw()

func _view_point(p: Vector2, with_pan := true) -> Vector2:
	var fit := min((size.x - 28.0) / world_size.x, (size.y - 28.0) / world_size.y)
	var offset := (size - world_size * fit * _zoom) * 0.5
	var point := offset + Vector2(p.x, world_size.y - p.y) * fit * _zoom
	return point + (_pan if with_pan else Vector2.ZERO)

func _unproject(point: Vector2) -> Vector2:
	var fit := min((size.x - 28.0) / world_size.x, (size.y - 28.0) / world_size.y)
	var offset := (size - world_size * fit * _zoom) * 0.5
	var local := (point - _pan - offset) / (fit * _zoom)
	return Vector2(local.x, world_size.y - local.y)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#111e25"))
	var top_left := _view_point(Vector2(0, world_size.y))
	var bottom_right := _view_point(Vector2(world_size.x, 0))
	var map_rect := Rect2(top_left, bottom_right - top_left)
	if biome_image != null:
		draw_texture_rect(biome_image, map_rect, false)
	else:
		draw_rect(map_rect, Color("#1f3545"))

	for region in regions:
		var vertices := PackedVector2Array()
		for pair in region.get("polygon_m", []):
			vertices.append(_view_point(Vector2(float(pair[0]), float(pair[1]))))
		if vertices.size() < 3:
			continue
		var biome := _dominant_biome(region)
		var base_color: Color = BIOME_COLORS[clampi(biome, 0, BIOME_COLORS.size() - 1)]
		if biome_image != null:
			base_color.a = 0.10
		else:
			base_color = base_color.darkened(0.24)
		draw_colored_polygon(vertices, base_color)
		var ring := PackedVector2Array(vertices)
		ring.append(vertices[0])
		draw_polyline(ring, Color(0.68, 0.80, 0.78, 0.32), 0.85 * maxf(1.0, sqrt(_zoom)), true)

		var region_id := str(region.get("id", ""))
		var state: Dictionary = progress.get(region_id, {})
		var completed := state.get("status", "") == "completed" and bool(state.get("approved", false))
		if completed:
			# Luz discreta apenas para modelos aprovados.
			draw_colored_polygon(vertices, Color(0.93, 0.78, 0.26, 0.25))
			draw_polyline(ring, Color(1.0, 0.90, 0.40, 0.72), 6.5, true)
			draw_polyline(ring, Color(1.0, 0.95, 0.64, 1.0), 2.25, true)
		elif state.get("status", "") == "in_development":
			draw_polyline(ring, Color(0.88, 0.66, 0.29, 0.95), 2.2, true)
		if region_id == selected_id:
			draw_polyline(ring, Color("#f5df9a"), 3.2, true)
			var point: Array = region.get("center_m", [0, 0])
			var center := _view_point(Vector2(float(point[0]), float(point[1])))
			draw_circle(center, 4.6, Color("#f3e3bd"))
			draw_string(ThemeDB.fallback_font, center + Vector2(8, -9), region_id, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)

func _dominant_biome(region: Dictionary) -> int:
	if region.has("dominant_biome_id"):
		return int(region["dominant_biome_id"])
	var best_fraction := -1.0
	var dominant := 0
	for item in region.get("biomes", []):
		if float(item.get("fraction", 0.0)) > best_fraction:
			best_fraction = float(item.get("fraction", 0.0))
			dominant = int(item.get("id", 0))
	return dominant

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var click: InputEventMouseButton = event
		if click.button_index == MOUSE_BUTTON_WHEEL_UP and click.pressed:
			_zoom = clampf(_zoom * 1.18, 0.75, 16.0)
			queue_redraw()
			accept_event()
		elif click.button_index == MOUSE_BUTTON_WHEEL_DOWN and click.pressed:
			_zoom = clampf(_zoom / 1.18, 0.75, 16.0)
			queue_redraw()
			accept_event()
		elif click.button_index == MOUSE_BUTTON_LEFT:
			if click.pressed:
				_dragging = true
				_drag_length = 0.0
				_last_cursor = click.position
			else:
				_dragging = false
				if _drag_length < 7.0:
					_pick(_unproject(click.position))
			accept_event()
	if event is InputEventMouseMotion and _dragging:
		var motion: InputEventMouseMotion = event
		_pan += motion.position - _last_cursor
		_drag_length += (motion.position - _last_cursor).length()
		_last_cursor = motion.position
		queue_redraw()
		accept_event()

func _pick(world_pos: Vector2) -> void:
	for region in regions:
		var polygon := PackedVector2Array()
		for pair in region.get("polygon_m", []):
			polygon.append(Vector2(float(pair[0]), float(pair[1])))
		if polygon.size() >= 3 and Geometry2D.is_point_in_polygon(world_pos, polygon):
			region_selected.emit(str(region.get("id", "")))
			return