class_name WorldNpcs
extends Node2D
## NPC sul Mondo cucito: i marker dei MERCANTI (moneta "M" dorata) e degli NPC con MISSIONI
## ("!" giallo se c'e' qualcosa da accettare o riscuotere, spento altrimenti), disegnati accanto
## all'etichetta del loro luogo. Un CLICK sul marker apre la bottega o il dialogo missioni — ma
## solo se il party e' abbastanza vicino: da lontano il gioco suggerisce di viaggiare fin la'
## (col viaggio a dadi, come tutto il resto). I marker si riallineano da soli quando cambiano
## campagna o stato delle quest.

const RAGGIO_MONDO: float = 46.0
const RAGGIO_SCHERMO_MIN: float = 12.0
const DISTANZA_INTERAZIONE: float = 480.0
const SCARTO_MERCANTE: Vector2 = Vector2(-150, 95)
const SCARTO_QUEST: Vector2 = Vector2(150, 95)
const COL_MERCANTE: Color = Color(0.87, 0.7, 0.28)
const COL_QUEST_VIVA: Color = Color(0.95, 0.85, 0.3)
const COL_QUEST_SPENTA: Color = Color(0.5, 0.47, 0.4)
const COL_BORDO: Color = Color(0.1, 0.08, 0.06, 0.92)

var _camera: Camera2D
var _etichette: WorldLabels
var _tokens: WorldTokens
var _marker: Array[Dictionary] = []   # { tipo, id, luogo, pos, nome, vivo }
var _ultimo_zoom: float = 0.0


func configura(camera: Camera2D, etichette: WorldLabels, tokens: WorldTokens) -> void:
	_camera = camera
	_etichette = etichette
	_tokens = tokens
	# Connessioni a METODO: si scollegano da sole quando il builder ricrea il layer.
	MerchantManager.mercanti_caricati.connect(_ricostruisci)
	QuestManager.quest_cambiata.connect(_ricostruisci)
	_ricostruisci()
	set_process(true)


## Ricostruisce i marker risolvendo i LUOGHI (nomi di etichette) in posizioni del mondo.
func _ricostruisci() -> void:
	_marker.clear()
	for m: Dictionary in MerchantManager.mercanti():
		var voce: Dictionary = _etichette.trova(String(m.get("luogo", "")))
		if voce.is_empty():
			continue
		_marker.append({
			"tipo": "mercante", "id": String(m.get("id", "")),
			"luogo": String(m.get("luogo", "")), "nome": String(m.get("nome", "Mercante")),
			"pos": (voce["pos"] as Vector2) + SCARTO_MERCANTE, "vivo": true,
		})
	# Un solo marker missioni per luogo, anche se gli NPC sono piu' d'uno.
	var luoghi_fatti: Array[String] = []
	for q: Dictionary in QuestManager.quest_correnti():
		var luogo: String = String(q.get("luogo", ""))
		if luoghi_fatti.has(luogo) or String(q.get("stato", "")) == "riscossa":
			continue
		var voce: Dictionary = _etichette.trova(luogo)
		if voce.is_empty():
			continue
		luoghi_fatti.append(luogo)
		_marker.append({
			"tipo": "quest", "id": luogo, "luogo": luogo,
			"nome": String(q.get("npc", "Viandante")),
			"pos": (voce["pos"] as Vector2) + SCARTO_QUEST,
			"vivo": QuestManager.luogo_ha_richiami(luogo),
		})
	queue_redraw()


func _process(_delta: float) -> void:
	if _camera != null and not is_equal_approx(_camera.zoom.x, _ultimo_zoom):
		_ultimo_zoom = _camera.zoom.x
		queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb == null or not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	var punto: Vector2 = get_global_mouse_position()
	var r: float = _raggio()
	for m: Dictionary in _marker:
		if (m["pos"] as Vector2).distance_to(punto) > r * 1.2:
			continue
		get_viewport().set_input_as_handled()
		_interagisci(m)
		return


## Click su un marker: da vicino si apre il pannello giusto, da lontano si suggerisce il viaggio.
func _interagisci(m: Dictionary) -> void:
	var distanza: float = INF
	if _tokens != null:
		distanza = _tokens.centro_gruppo().distance_to(m["pos"] as Vector2)
	if distanza > DISTANZA_INTERAZIONE:
		GameState.announce("🧭 %s e' a %s: viaggia fin la' per parlarci (selettore Viaggia a…)." % [
			String(m["nome"]), String(m["luogo"]),
		])
		return
	GameState.publish("npc:apri", { "tipo": String(m["tipo"]), "id": String(m["id"]) })


func _draw() -> void:
	if _camera == null:
		return
	var font: Font = ThemeDB.fallback_font
	var r: float = _raggio()
	for m: Dictionary in _marker:
		var pos: Vector2 = m["pos"]
		var mercante: bool = String(m["tipo"]) == "mercante"
		var colore: Color = COL_MERCANTE if mercante \
			else (COL_QUEST_VIVA if bool(m["vivo"]) else COL_QUEST_SPENTA)
		draw_circle(pos, r * 1.12, COL_BORDO)
		draw_circle(pos, r, colore)
		draw_circle(pos, r * 0.8, colore.lightened(0.15))
		var glifo: String = "M" if mercante else "!"
		var dim: int = int(r * 1.25)
		draw_string(font, pos + Vector2(-r, r * 0.45), glifo,
			HORIZONTAL_ALIGNMENT_CENTER, r * 2.0, dim, Color(0.12, 0.09, 0.05))
		if _camera.zoom.x >= 0.3:
			var dim_nome: int = int(maxf(16.0, r * 0.45))
			draw_string(font, pos + Vector2(-r * 4 + 2, r * 1.6 + dim_nome + 2),
				String(m["nome"]), HORIZONTAL_ALIGNMENT_CENTER, r * 8.0, dim_nome,
				Color(0, 0, 0, 0.7))
			draw_string(font, pos + Vector2(-r * 4, r * 1.6 + dim_nome), String(m["nome"]),
				HORIZONTAL_ALIGNMENT_CENTER, r * 8.0, dim_nome, Color(0.9, 0.86, 0.75))


func _raggio() -> float:
	if _camera == null:
		return RAGGIO_MONDO
	return maxf(RAGGIO_MONDO, RAGGIO_SCHERMO_MIN / maxf(_camera.zoom.x, 0.01))
