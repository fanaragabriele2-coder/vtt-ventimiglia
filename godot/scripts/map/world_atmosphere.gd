class_name WorldAtmosphere
extends Node2D
## Atmosfera del Mondo cucito: il mondo statico prende vita con tre tocchi LEGGERI.
##
## 1. OMBRE DI NUVOLE: un rumore seamless (NoiseTexture2D) steso su tutto il mondo e fatto
##    scorrere dallo shader (TIME) — costa UN draw call, niente texture animate su disco.
## 2. LUCCIOLE (notte) e PULVISCOLO (giorno): due CPUParticles2D che SEGUONO la camera —
##    l'area di emissione e' grande quanto una schermata, non quanto il mondo: poche decine
##    di particelle bastano ovunque tu vada, costo costante a prescindere dalla mappa.
## 3. L'intensita' di tutto segue l'ora del giorno (imposta_ora), in coppia con la tinta
##    globale del WorldBuilder.
## Tutto procedurale: zero asset su disco, zero VRAM sprecata, zero dipendenze.

const NUVOLE_TILE: float = 6.0   # quante "piastrelle" di rumore coprono il mondo (nuvole larghe)

const SHADER_NUVOLE: String = """
shader_type canvas_item;
uniform float velocita = 0.006;
uniform float copertura = 0.55;
uniform float intensita = 0.14;
uniform float tile = 6.0;
void fragment() {
	vec2 uv = UV * tile + vec2(TIME * velocita, TIME * velocita * 0.62);
	float n = texture(TEXTURE, uv).r;
	float ombra = smoothstep(copertura, copertura + 0.28, n);
	COLOR = vec4(0.0, 0.0, 0.04, ombra * intensita);
}
"""

## Intensita' dell'ombra-nuvola per ora del giorno (0 = niente nuvole).
const NUVOLE_ORE: Dictionary = {
	"giorno": 0.14, "tramonto": 0.10, "notte": 0.05, "dungeon": 0.0,
}

var _nuvole: Sprite2D
var _lucciole: CPUParticles2D
var _polline: CPUParticles2D
var _camera: Camera2D


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_camera = camera
	_crea_nuvole(rect_mondo)
	_lucciole = _crea_particelle(
		Color(1.0, 0.86, 0.42, 0.9), 30, 3.2, 14.0)  # puntini caldi che vagano lenti
	_polline = _crea_particelle(
		Color(1.0, 0.98, 0.9, 0.28), 22, 2.2, 8.0)   # pulviscolo quasi impalpabile
	imposta_ora("giorno")
	set_process(true)


func _process(_delta: float) -> void:
	# Gli emettitori inseguono la camera: le particelle esistono solo dove stai guardando.
	if _camera == null or not is_instance_valid(_camera):
		return
	_lucciole.position = _camera.position
	_polline.position = _camera.position


## Adegua nuvole e particelle all'ora del mondo (chiamato dal WorldBuilder in imposta_ora).
func imposta_ora(nome: String) -> void:
	var intensita: float = float(NUVOLE_ORE.get(nome, 0.12))
	_nuvole.visible = intensita > 0.0
	(_nuvole.material as ShaderMaterial).set_shader_parameter("intensita", intensita)
	_lucciole.emitting = nome == "notte" or nome == "tramonto"
	_polline.emitting = nome == "giorno" or nome == "tramonto"


func _crea_nuvole(rect: Rect2) -> void:
	var rumore := FastNoiseLite.new()
	rumore.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	rumore.frequency = 0.008
	var tex := NoiseTexture2D.new()
	tex.noise = rumore
	tex.seamless = true            # il tiling NUVOLE_TILE non mostra giunture
	tex.width = 512
	tex.height = 512

	var shader := Shader.new()
	shader.code = SHADER_NUVOLE
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("tile", NUVOLE_TILE)

	_nuvole = Sprite2D.new()
	_nuvole.texture = tex
	_nuvole.centered = false
	_nuvole.position = rect.position
	_nuvole.scale = rect.size / Vector2(512, 512)
	_nuvole.material = mat
	_nuvole.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED  # l'UV*tile deve poter wrappare
	_nuvole.z_index = -3           # sopra terreno (-10) e griglia (-5), sotto token e UI
	add_child(_nuvole)


## Particelle additive con texture radiale generata al volo (un alone morbido, non un quadrato).
func _crea_particelle(colore: Color, quantita: int, dim: float, vel: float) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.amount = quantita
	p.lifetime = 5.0
	p.preprocess = 5.0             # gia' a regime quando appare: niente "partenza vuota"
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(760, 460)  # ~una schermata attorno alla camera
	p.gravity = Vector2.ZERO
	p.initial_velocity_min = vel * 0.4
	p.initial_velocity_max = vel
	p.direction = Vector2(1, 0)
	p.spread = 180.0               # vagano in ogni direzione
	p.scale_amount_min = dim * 0.6
	p.scale_amount_max = dim
	p.color = colore

	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 1))
	grad.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = grad
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(0.5, 0.0)
	tex.width = 32
	tex.height = 32
	p.texture = tex

	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD  # brillano invece di coprire
	p.material = mat
	p.z_index = -2
	add_child(p)
	return p
