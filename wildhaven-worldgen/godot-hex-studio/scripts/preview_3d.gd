extends SubViewportContainer
## Visualizador Godot 4 do GLB verdadeiro, com fallback geométrico provisório.
signal preview_changed(message: String)

const HEX_RADIUS := 105.0
var viewport_3d: SubViewport
var scene_root: Node3D
var asset_root: Node3D
var camera: Camera3D
var yaw := 0.75
var pitch := 0.75
var distance := 285.0
var target := Vector3(0.0, 10.0, 0.0)
var _orbiting := false
var _panning := false
var _active_model_path := ""
var _noise := FastNoiseLite.new()
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	stretch = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	viewport_3d = SubViewport.new()
	viewport_3d.size = Vector2i(1080, 680)
	viewport_3d.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport_3d)

	scene_root = Node3D.new()
	scene_root.name = "SceneRoot"
	viewport_3d.add_child(scene_root)
	asset_root = Node3D.new()
	asset_root.name = "ExportableScene"
	scene_root.add_child(asset_root)

	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#1c3440")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#b2c6c5")
	env.ambient_light_energy = 0.55
	environment.environment = env
	scene_root.add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-55, -33, 0)
	sun.light_color = Color("#fff0cc")
	sun.light_energy = 1.65
	sun.shadow_enabled = true
	scene_root.add_child(sun)

	camera = Camera3D.new()
	camera.name = "PreviewCamera"
	camera.fov = 46.0
	camera.near = 0.3
	camera.far = 6000.0
	scene_root.add_child(camera)
	camera.current = true
	_update_camera()

func show_region(info: Dictionary) -> void:
	var region_id := str(info.get("id", ""))
	if region_id == "H_5_7" and FileAccess.file_exists("res://assets/H_5_7_forest.glb"):
		if import_glb("res://assets/H_5_7_forest.glb"):
			preview_changed.emit("H_5_7 • modelo mid-poly original carregado")
			return
	_generate_procedural_preview(info)
	preview_changed.emit("%s • prévia geométrica, ainda não aprovada" % region_id)

func import_glb(path: String) -> bool:
	if not FileAccess.file_exists(path):
		preview_changed.emit("Arquivo 3D não encontrado: " + path)
		return false
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var status := doc.append_from_file(path, state)
	if status != OK:
		preview_changed.emit("Falha ao ler GLB: código %d" % int(status))
		return false
	var imported: Node = doc.generate_scene(state)
	if imported == null:
		preview_changed.emit("GLB lido, mas a cena não foi criada")
		return false
	_clear_asset()
	asset_root.add_child(imported)
	_active_model_path = path
	_fit_model()
	preview_changed.emit("Modelo 3D importado: " + path.get_file())
	return true

func export_glb(path: String) -> int:
	if asset_root.get_child_count() == 0:
		return ERR_DOES_NOT_EXIST
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var error := doc.append_from_scene(asset_root, state)
	if error != OK:
		return error
	return doc.write_to_filesystem(state, path)

func reset_camera() -> void:
	yaw = 0.75
	pitch = 0.75
	_fit_model()

func _clear_asset() -> void:
	for node in asset_root.get_children():
		asset_root.remove_child(node)
		node.queue_free()

func _fit_model() -> void:
	var has_bounds := false
	var min_corner := Vector3.ZERO
	var max_corner := Vector3.ZERO
	for node in asset_root.find_children("*", "MeshInstance3D", true, false):
		var instance: MeshInstance3D = node as MeshInstance3D
		if instance.mesh == null:
			continue
		var box: AABB = instance.mesh.get_aabb()
		for corner_index in range(8):
			var point: Vector3 = instance.global_transform * box.get_endpoint(corner_index)
			if not has_bounds:
				min_corner = point
				max_corner = point
				has_bounds = true
			else:
				min_corner = min_corner.min(point)
				max_corner = max_corner.max(point)
	if has_bounds:
		target = (min_corner + max_corner) * 0.5
		distance = maxf(100.0, (max_corner - min_corner).length() * 1.28)
	else:
		target = Vector3(0, 8, 0)
		distance = 285.0
	_update_camera()

func _update_camera() -> void:
	if camera == null:
		return
	var direction := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	camera.position = target + direction * distance
	camera.look_at(target, Vector3.UP)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var click: InputEventMouseButton = event
		if click.button_index == MOUSE_BUTTON_WHEEL_UP and click.pressed:
			distance = maxf(15.0, distance * 0.88)
			_update_camera()
			accept_event()
		elif click.button_index == MOUSE_BUTTON_WHEEL_DOWN and click.pressed:
			distance = minf(3000.0, distance * 1.14)
			_update_camera()
			accept_event()
		elif click.button_index == MOUSE_BUTTON_LEFT:
			_orbiting = click.pressed
			accept_event()
		elif click.button_index == MOUSE_BUTTON_RIGHT or click.button_index == MOUSE_BUTTON_MIDDLE:
			_panning = click.pressed
			accept_event()
	if event is InputEventMouseMotion:
		var motion: InputEventMouseMotion = event
		if _orbiting:
			yaw -= motion.relative.x * 0.008
			pitch = clampf(pitch - motion.relative.y * 0.008, 0.12, 1.45)
			_update_camera()
			accept_event()
		elif _panning:
			var pan_factor := distance / 700.0
			target -= camera.global_transform.basis.x * motion.relative.x * pan_factor
			target += camera.global_transform.basis.y * motion.relative.y * pan_factor
			_update_camera()
			accept_event()

func _generate_procedural_preview(info: Dictionary) -> void:
	# É uma prévia simplificada de geometria real, jamais um hex completo aprovado.
	_clear_asset()
	_active_model_path = ""
	var region_id := str(info.get("id", "H_0_0"))
	var code := region_id.hash()
	_noise.seed = code
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.frequency = 0.020
	_rng.seed = abs(code) + 5310
	var biome := _biome_id(info)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var corners: Array[Vector2] = []
	for k in range(6):
		var angle := PI / 6.0 + TAU * float(k) / 6.0
		corners.append(Vector2(cos(angle), sin(angle)) * HEX_RADIUS)
	var resolution := 28
	for k in range(6):
		var a: Vector2 = corners[k]
		var b: Vector2 = corners[(k + 1) % 6]
		for i in range(resolution):
			for j in range(resolution - i):
				var f0 := float(i) / resolution
				var g0 := float(j) / resolution
				var f1 := float(i + 1) / resolution
				var g1 := float(j + 1) / resolution
				var p0 := a * f0 + b * g0
				var p1 := a * f1 + b * g0
				var p2 := a * f0 + b * g1
				_write_triangle(st, p0, p2, p1, biome)
				if i + j < resolution - 1:
					var p3 := a * f1 + b * g1
					_write_triangle(st, p1, p2, p3, biome)
	st.generate_normals()
	var terrain_mesh := st.commit()
	var ground := MeshInstance3D.new()
	ground.name = "ProvisionalTerrain"
	ground.mesh = terrain_mesh
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.91
	ground.material_override = mat
	asset_root.add_child(ground)
	_add_procedural_vegetation(biome)
	_fit_model()

func _biome_id(info: Dictionary) -> int:
	if info.has("dominant_biome_id"):
		return int(info["dominant_biome_id"])
	var best := 0.0
	var code := 0
	for item in info.get("biomes", []):
		var fraction := float(item.get("fraction", 0.0))
		if fraction > best:
			best = fraction
			code = int(item.get("id", 0))
	return code

func _base_color(biome: int) -> Color:
	var colors := [
		Color("#315268"), Color("#5b9864"), Color("#397b5a"), Color("#6c8e73"),
		Color("#bbc8b8"), Color("#c7b268"), Color("#9eac71"), Color("#b69b78"),
		Color("#637b64"), Color("#a4aeb4"), Color("#538e79"), Color("#62b5ad"),
		Color("#a094c9"), Color("#716778"), Color("#5d5c61"), Color("#a8c5ba")
	]
	return colors[clampi(biome, 0, colors.size() - 1)]

func _height_at(point: Vector2) -> float:
	var a := _noise.get_noise_2d(point.x, point.y)
	var b := _noise.get_noise_2d(point.x * 2.1 + 81.0, point.y * 2.1 + 17.0)
	return a * 10.0 + b * 2.6 + 2.8 * sin(point.x / 35.0) + 2.6 * cos(point.y / 42.0)

func _write_triangle(st: SurfaceTool, a: Vector2, b: Vector2, c: Vector2, biome: int) -> void:
	for p in [a, b, c]:
		var height := _height_at(p)
		var col := _base_color(biome).lerp(Color("#65716b"), clampf((height - 10.0) / 24.0, 0.0, 0.28))
		st.set_color(col)
		st.add_vertex(Vector3(p.x, height, p.y))

func _within_hex(p: Vector2) -> bool:
	var ax := absf(p.x)
	var ay := absf(p.y)
	return ax <= HEX_RADIUS * 0.866 and ay <= HEX_RADIUS - ax / 1.732

func _add_procedural_vegetation(biome: int) -> void:
	if biome == 0 or biome == 4 or biome == 9 or biome == 14:
		return
	var count := 125 if biome in [1, 2, 3, 11, 13] else 35
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.15
	trunk_mesh.bottom_radius = 0.42
	trunk_mesh.height = 1.0
	trunk_mesh.radial_segments = 5
	var leaf_mesh := SphereMesh.new()
	leaf_mesh.radius = 1.0
	leaf_mesh.height = 2.0
	leaf_mesh.radial_segments = 7
	leaf_mesh.rings = 5

	var trunks := MultiMesh.new()
	trunks.transform_format = MultiMesh.TRANSFORM_3D
	trunks.mesh = trunk_mesh
	trunks.instance_count = count
	var leaves := MultiMesh.new()
	leaves.transform_format = MultiMesh.TRANSFORM_3D
	leaves.mesh = leaf_mesh
	leaves.instance_count = count

	var tint := _base_color(biome)
	for i in range(count):
		var p := Vector2.ZERO
		for attempt in range(60):
			p = Vector2(_rng.randf_range(-90, 90), _rng.randf_range(-90, 90))
			if _within_hex(p):
				break
		var y := _height_at(p)
		var tree_height := _rng.randf_range(5.0, 12.0)
		var thickness := _rng.randf_range(0.7, 1.5)
		var trunk_basis := Basis().scaled(Vector3(thickness, tree_height, thickness))
		trunks.set_instance_transform(i, Transform3D(trunk_basis, Vector3(p.x, y + tree_height * 0.5, p.y)))
		var canopy_basis := Basis().scaled(Vector3(tree_height * 0.3, tree_height * 0.4, tree_height * 0.3))
		leaves.set_instance_transform(i, Transform3D(canopy_basis, Vector3(p.x, y + tree_height * 0.98, p.y)))

	var trunk_node := MultiMeshInstance3D.new()
	trunk_node.name = "ProvisionalTrunks"
	trunk_node.multimesh = trunks
	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color("#64503a")
	trunk_node.material_override = trunk_mat
	asset_root.add_child(trunk_node)
	var leaf_node := MultiMeshInstance3D.new()
	leaf_node.name = "ProvisionalCanopies"
	leaf_node.multimesh = leaves
	var leaf_mat := StandardMaterial3D.new()
	leaf_mat.albedo_color = tint.darkened(0.13)
	leaf_node.material_override = leaf_mat
	asset_root.add_child(leaf_node)

func make_provisional(info: Dictionary) -> void:
	_generate_procedural_preview(info)
	preview_changed.emit("%s • prévia procedural não aprovada" % str(info.get("id", "")))