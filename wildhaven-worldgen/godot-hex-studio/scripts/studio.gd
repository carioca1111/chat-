extends Control
## Aplicativo independente para inspeção e aprovação de hexágonos de Auralis.
## Não altera o jogo Wildhaven nem o mapa geográfico autoritativo.

const AtlasViewScript = preload("res://scripts/atlas_view.gd")
const Preview3DScript = preload("res://scripts/preview_3d.gd")
const PROGRESS_FILE := "user://wildhaven_hex_studio_progress.json"
const BIOME_NAMES := [
	"Água", "Floresta Temperada", "Selva Tropical", "Taiga", "Tundra",
	"Savana", "Pradarias", "Deserto Rochoso", "Pântano", "Montanhas Alpinas",
	"Manguezal Costeiro", "Floresta Luminescente", "Vale Cristalino",
	"Pântano Micelial", "Terras de Cinza", "Vale Etéreo"
]

var regions: Array = []
var by_id: Dictionary = {}
var progress: Dictionary = {}
var selected_id := "H_5_7"
var _filtered_ids: Array[String] = []

var atlas_view: Control
var preview_3d: SubViewportContainer
var workspace_tabs: TabContainer
var region_list: ItemList
var search_field: LineEdit
var region_title: Label
var region_details: Label
var state_option: OptionButton
var approval_box: CheckBox
var status_label: Label
var model_label: Label
var source_label: Label

func _ready() -> void:
	_load_project_data()
	_build_layout()
	_fill_region_list("")
	_select_region(selected_id)
	# Carrega a primeira cena 3D antes de trocar de aba.
	_open_selected_3d()
	workspace_tabs.current_tab = 0

func _load_project_data() -> void:
	var path := "res://data/regions.json"
	if not FileAccess.file_exists(path):
		path = "res://data/regions_snapshot.json"
	var atlas_data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if atlas_data is Dictionary:
		regions = atlas_data.get("regions", [])
	for data in regions:
		by_id[str(data.get("id", ""))] = data
	var reference = JSON.parse_string(FileAccess.get_file_as_string("res://data/progress.json"))
	if reference is Dictionary:
		progress = reference.get("regions", {}).duplicate(true)
	if FileAccess.file_exists(PROGRESS_FILE):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(PROGRESS_FILE))
		if saved is Dictionary and saved.has("regions") and saved["regions"] is Dictionary:
			for id in saved["regions"]:
				progress[id] = saved["regions"][id]

func _surface(color: Color, roundness: int = 8) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(roundness)
	return style

func _label(text: String, size_px: int = 14, color: Color = Color("#e2ece8")) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_color_override("font_color", color)
	label.add_theme_font_size_override("font_size", size_px)
	return label

func _styled_button(text: String, callback: Callable, colored := false) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(0, 36)
	btn.add_theme_font_size_override("font_size", 13)
	btn.add_theme_stylebox_override("normal", _surface(Color("#426b59") if colored else Color("#253841"), 7))
	btn.add_theme_stylebox_override("hover", _surface(Color("#548a70") if colored else Color("#37545b"), 7))
	btn.add_theme_stylebox_override("pressed", _surface(Color("#294a3b"), 7))
	btn.pressed.connect(callback)
	return btn

func _panel(color := Color("#192b34")) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _surface(color, 0))
	return panel

func _column(gap: int = 10) -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", gap)
	return col

func _margin(child: Control, top: int = 15, right: int = 15, bottom: int = 15, left: int = 15) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", top)
	m.add_theme_constant_override("margin_right", right)
	m.add_theme_constant_override("margin_bottom", bottom)
	m.add_theme_constant_override("margin_left", left)
	m.add_child(child)
	return m

func _build_layout() -> void:
	var background := ColorRect.new()
	background.color = Color("#101b24")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var main := _column(0)
	main.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(main)

	# Barra superior.
	var header := _panel(Color("#20343c"))
	header.custom_minimum_size.y = 72
	main.add_child(header)
	var head_line := HBoxContainer.new()
	head_line.add_theme_constant_override("separation", 12)
	header.add_child(_margin(head_line, 11, 18, 11, 18))
	var brand := _column(2)
	brand.add_child(_label("WILDHAVEN  /  HEX STUDIO", 22, Color("#efdcad")))
	brand.add_child(_label("Ateliê geográfico de Auralis   •   Godot 4", 12, Color("#9eb7b0")))
	head_line.add_child(brand)
	var header_spacer := Control.new()
	header_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_line.add_child(header_spacer)
	head_line.add_child(_styled_button("Atlas", func() -> void: workspace_tabs.current_tab = 0))
	head_line.add_child(_styled_button("Cena 3D", func() -> void: workspace_tabs.current_tab = 1))
	head_line.add_child(_styled_button("Importar GLB", _import_dialog))
	head_line.add_child(_styled_button("Exportar GLB", _export_model_dialog, true))

	# 3 painéis: catálogo, workspace, propriedades.
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 1)
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	main.add_child(columns)

	var catalog_panel := _panel()
	catalog_panel.custom_minimum_size.x = 242
	columns.add_child(catalog_panel)
	var catalog := _column(9)
	catalog_panel.add_child(_margin(catalog))
	catalog.add_child(_label("REGIÕES DO MUNDO", 15, Color("#f1db9e")))
	source_label = _label("Auralis", 11, Color("#8fa9ab"))
	catalog.add_child(source_label)
	search_field = LineEdit.new()
	search_field.placeholder_text = "Buscar H_5_7..."
	search_field.custom_minimum_size.y = 36
	search_field.text_changed.connect(_fill_region_list)
	catalog.add_child(search_field)
	region_list = ItemList.new()
	region_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	region_list.select_mode = ItemList.SELECT_SINGLE
	region_list.add_theme_color_override("font_selected_color", Color("#ffe19c"))
	region_list.item_selected.connect(_on_list_item_selected)
	catalog.add_child(region_list)
	catalog.add_child(_styled_button("Mostrar no atlas", _focus_map))

	workspace_tabs = TabContainer.new()
	workspace_tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	workspace_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_child(workspace_tabs)

	atlas_view = AtlasViewScript.new()
	atlas_view.name = "Atlas Mundial"
	atlas_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	atlas_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	atlas_view.region_selected.connect(_select_region)
	workspace_tabs.add_child(atlas_view)

	var scene_container := _column(0)
	scene_container.name = "Cenário 3D"
	scene_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scene_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	workspace_tabs.add_child(scene_container)
	preview_3d = Preview3DScript.new()
	preview_3d.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview_3d.size_flags_vertical = Control.SIZE_EXPAND_FILL
	preview_3d.preview_changed.connect(_set_status)
	scene_container.add_child(preview_3d)
	var scene_tools := HBoxContainer.new()
	scene_tools.add_theme_constant_override("separation", 10)
	scene_container.add_child(_margin(scene_tools, 8, 10, 9, 10))
	scene_tools.add_child(_styled_button("Restaurar modelo", _open_selected_3d))
	scene_tools.add_child(_styled_button("Prévia procedural", _generate_sample))
	scene_tools.add_child(_styled_button("Enquadrar câmera", func() -> void: preview_3d.reset_camera()))

	var inspector_panel := _panel()
	inspector_panel.custom_minimum_size.x = 274
	columns.add_child(inspector_panel)
	var inspector := _column(14)
	inspector_panel.add_child(_margin(inspector, 16, 13, 15, 13))
	inspector.add_child(_label("PROPRIEDADES", 15, Color("#f1db9e")))
	region_title = _label("H_5_7", 20, Color.WHITE)
	inspector.add_child(region_title)
	region_details = _label("Dados geográficos", 12, Color("#b1c5c3"))
	region_details.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	region_details.custom_minimum_size.y = 175
	inspector.add_child(region_details)
	inspector.add_child(_label("ETAPA DE PRODUÇÃO", 12, Color("#efdcad")))
	state_option = OptionButton.new()
	state_option.add_item("Pendente", 0)
	state_option.add_item("Em desenvolvimento", 1)
	state_option.add_item("Concluído", 2)
	state_option.custom_minimum_size.y = 38
	inspector.add_child(state_option)
	approval_box = CheckBox.new()
	approval_box.text = "Aprovado visualmente"
	inspector.add_child(approval_box)
	inspector.add_child(_styled_button("Salvar status", _save_progress, true))
	inspector.add_child(_styled_button("Exportar status JSON", _export_progress_dialog))
	inspector.add_child(_styled_button("Abrir região 3D", _open_selected_3d))
	inspector.add_child(_label("MODELO DO HEXÁGONO", 12, Color("#efdcad")))
	model_label = _label("—", 12, Color("#a9bcb9"))
	model_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	inspector.add_child(model_label)
	var inspector_spacer := Control.new()
	inspector_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	inspector.add_child(inspector_spacer)
	var warning := _label("Os modelos só ficam iluminados após conclusão e aprovação. Nenhuma mudança é enviada ao jogo.", 11, Color("#96aaa7"))
	warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	inspector.add_child(warning)

	var footer := _panel(Color("#21343b"))
	footer.custom_minimum_size.y = 33
	main.add_child(footer)
	status_label = _label("Projeto independente • alterações locais", 12, Color("#e2e6d6"))
	footer.add_child(_margin(status_label, 7, 12, 5, 12))

	var world_data_path := "res://data/regions.json"
	if not FileAccess.file_exists(world_data_path):
		world_data_path = "res://data/regions_snapshot.json"
	var world = JSON.parse_string(FileAccess.get_file_as_string(world_data_path))
	var map_texture: Texture2D
	if FileAccess.file_exists("res://data/biomes.png"):
		var img := Image.new()
		if img.load("res://data/biomes.png") == OK:
			map_texture = ImageTexture.create_from_image(img)
	if world is Dictionary:
		atlas_view.set_world(world, map_texture)
	atlas_view.set_statuses(progress)
	source_label.text = "%s  •  %d regiões" % ["Dados completos" if FileAccess.file_exists("res://data/regions.json") else "Atlas resumido", regions.size()]

func _fill_region_list(search_text: String) -> void:
	if region_list == null:
		return
	region_list.clear()
	_filtered_ids.clear()
	var query := search_text.strip_edges().to_lower()
	for info in regions:
		var id := str(info.get("id", ""))
		var extra := " · Bosque das Cascatas" if id == "H_5_7" else ""
		if not query.is_empty() and not (id + extra).to_lower().contains(query):
			continue
		var state: Dictionary = progress.get(id, {})
		var suffix := " ✓" if state.get("status", "") == "completed" and state.get("approved", false) else (" ◐" if state.get("status", "") == "in_development" else "")
		region_list.add_item(id + suffix + extra)
		_filtered_ids.append(id)
	var idx := _filtered_ids.find(selected_id)
	if idx >= 0:
		region_list.select(idx)
		region_list.ensure_current_is_visible()

func _on_list_item_selected(index: int) -> void:
	if index >= 0 and index < _filtered_ids.size():
		_select_region(_filtered_ids[index])

func _select_region(region_id: String) -> void:
	if not by_id.has(region_id):
		return
	selected_id = region_id
	atlas_view.select_region(region_id)
	var data: Dictionary = by_id[region_id]
	region_title.text = "Bosque das Cascatas" if region_id == "H_5_7" else region_id
	var biome_id := int(data.get("dominant_biome_id", 0))
	var best_fraction := -1.0
	for part in data.get("biomes", []):
		if float(part.get("fraction", 0.0)) > best_fraction:
			best_fraction = float(part.get("fraction", 0.0))
			biome_id = int(part.get("id", 0))
	var biome := BIOME_NAMES[clampi(biome_id, 0, BIOME_NAMES.size() - 1)]
	var location: Array = data.get("center_m", [0, 0])
	var details := "ID: %s\nBioma predominante: %s\nCentro: %.0f, %.0f km\n" % [region_id, biome, float(location[0]) / 1000.0, float(location[1]) / 1000.0]
	if data.has("elevation_m"):
		details += "Altitude média: %.0f m\n" % float(data["elevation_m"].get("mean", 0.0))
	if data.has("temperature_c"):
		details += "Temperatura média: %.1f °C\n" % float(data["temperature_c"].get("mean", 0.0))
	if data.has("rivers"):
		details += "Segmentos de rios: %d\n" % data["rivers"].size()
	if not data.has("elevation_m"):
		details += "Dados detalhados: importar do Codex\n"
	region_details.text = details
	var state: Dictionary = progress.get(region_id, {})
	match str(state.get("status", "pending")):
		"in_development": state_option.select(1)
		"completed": state_option.select(2)
		_: state_option.select(0)
	approval_box.button_pressed = bool(state.get("approved", false))
	model_label.text = "GLB mid-poly original disponível" if region_id == "H_5_7" else "Sem GLB aprovado; prévia geométrica disponível"
	var idx := _filtered_ids.find(region_id)
	if idx >= 0 and region_list.get_selected_items().has(idx) == false:
		region_list.select(idx)
	_set_status("Região %s selecionada • %s" % [region_id, biome])

func _open_selected_3d() -> void:
	if not by_id.has(selected_id):
		return
	workspace_tabs.current_tab = 1
	preview_3d.show_region(by_id[selected_id])

func _generate_sample() -> void:
	if by_id.has(selected_id):
		preview_3d.make_provisional(by_id[selected_id])

func _focus_map() -> void:
	workspace_tabs.current_tab = 0
	atlas_view.focus_selected()

func _save_progress() -> void:
	var stage := ["pending", "in_development", "completed"][state_option.selected]
	if stage == "completed" and not approval_box.button_pressed:
		_set_status("Para concluir, marque também a aprovação visual.")
		return
	var prior: Dictionary = progress.get(selected_id, {}).duplicate(true)
	prior["status"] = stage
	prior["approved"] = approval_box.button_pressed
	progress[selected_id] = prior
	var save := {"schema_version": "1.0", "world_seed": 20051028, "regions": progress}
	var file := FileAccess.open(PROGRESS_FILE, FileAccess.WRITE)
	if file == null:
		_set_status("Falha ao salvar: %d" % FileAccess.get_open_error())
		return
	file.store_string(JSON.stringify(save, "\t"))
	file.close()
	atlas_view.set_statuses(progress)
	_fill_region_list(search_field.text)
	_set_status("Status salvo localmente • %s" % selected_id)

func _new_file_dialog(save_file: bool, filter: String, callback: Callable) -> void:
	var picker := FileDialog.new()
	picker.access = FileDialog.ACCESS_FILESYSTEM
	picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE if save_file else FileDialog.FILE_MODE_OPEN_FILE
	picker.filters = PackedStringArray([filter])
	add_child(picker)
	picker.file_selected.connect(func(path: String) -> void:
		callback.call(path)
		picker.queue_free()
	)
	picker.canceled.connect(func() -> void: picker.queue_free())
	picker.popup_centered_ratio(0.65)

func _import_dialog() -> void:
	_new_file_dialog(false, "*.glb, *.gltf ; Modelos 3D glTF", func(path: String) -> void:
		workspace_tabs.current_tab = 1
		preview_3d.import_glb(path)
	)

func _export_model_dialog() -> void:
	_new_file_dialog(true, "*.glb ; Modelo 3D", func(path: String) -> void:
		var result: int = preview_3d.export_glb(path)
		_set_status("GLB exportado: " + path if result == OK else "Exportação falhou: %d" % result)
	)

func _export_progress_dialog() -> void:
	_new_file_dialog(true, "*.json ; Dados JSON", func(path: String) -> void:
		var file := FileAccess.open(path, FileAccess.WRITE)
		if file == null:
			_set_status("Não foi possível escrever o arquivo")
			return
		file.store_string(JSON.stringify({"schema_version":"1.0", "seed":20051028, "regions": progress}, "\t"))
		file.close()
		_set_status("Status exportado para " + path)
	)

func _set_status(message: String) -> void:
	if status_label != null:
		status_label.text = message