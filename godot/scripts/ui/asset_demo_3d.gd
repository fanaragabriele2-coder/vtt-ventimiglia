extends Node3D
## Demo del PRIMO asset passato per la pipeline Blender -> Godot (vedi tools/README.md):
## Pilastro della Cripta — HP 47.616 tris ridotto a LP 212 tris (224x), dettaglio trasferito in
## normal/AO/basecolor con tools/hp_to_lp_bake.py, esportato in GLB da tools/export_glb.py.
##
## Apri scenes/asset_demo_3d.tscn e premi Play sulla scena (F6): tre pilastri che ruotano.
## Il .glb viene importato da Godot alla PRIMA apertura del progetto (genera i .import da solo).

const PERCORSO_GLB: String = "res://art/exports/pilastro_cripta.glb"
const VELOCITA_ROTAZIONE: float = 0.4

var _pivot: Node3D


func _ready() -> void:
	var scena: PackedScene = load(PERCORSO_GLB) as PackedScene
	if scena == null:
		push_warning("GLB non trovato o non ancora importato: " + PERCORSO_GLB)
		return

	_pivot = Node3D.new()
	add_child(_pivot)
	for i: int in range(3):
		var pilastro: Node3D = scena.instantiate() as Node3D
		pilastro.position = Vector3(float(i - 1) * 1.4, 0.0, 0.0)
		_pivot.add_child(pilastro)

	var luce := DirectionalLight3D.new()
	luce.rotation_degrees = Vector3(-45.0, -30.0, 0.0)
	luce.light_energy = 1.2
	add_child(luce)

	var ambiente := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.05, 0.07)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.35, 0.35, 0.4)
	env.ambient_light_energy = 1.0
	ambiente.environment = env
	add_child(ambiente)

	var camera := Camera3D.new()
	add_child(camera)
	camera.position = Vector3(0.0, 2.2, 4.5)
	camera.look_at(Vector3(0.0, 1.4, 0.0))
	camera.current = true


func _process(delta: float) -> void:
	if _pivot != null:
		_pivot.rotate_y(delta * VELOCITA_ROTAZIONE)
