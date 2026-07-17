class_name WorldEnemyTokens
extends Node2D
## Token dei NEMICI sul Mondo cucito: quando l'Encounter Balancer evoca un PNG (CombatManager.
## combatant_added), il suo gettone appare qui — non solo nella griglia tattica astratta — a
## DISTANZA REALE dal gruppo, sulla stessa scala del righello (1 cella = 1,5 m): i nemici da
## mischia compaiono a poche celle, quelli da tiro (gittata del bestiario) molto piu' lontano,
## in una direzione casuale attorno al party. Puramente visivo (nessun trascinamento: la
## posizione di gioco autorevole resta quella della mappa tattica) — sparisce alla sconfitta
## del singolo nemico, alla sua rimozione dal Master o alla fine dello scontro.

const PX_PER_CELLA: float = 128.0
const DISTANZA_MISCHIA_CELLE: float = 3.0
const DISTANZA_MAX_CELLE: float = 14.0
const RAGGIO_MONDO: float = 44.0
const RAGGIO_SCHERMO_MIN: float = 12.0
const ZOOM_NOME: float = 0.30
const COLORE: Color = Color(0.62, 0.16, 0.14)
const DURATA_SCATTO: float = 0.28
const DURATA_FLASH: float = 0.26   # lampo bianco quando il nemico incassa un colpo
const DURATA_MORTE: float = 0.9    # dissolvenza+rotazione del caduto (non sparisce di colpo)

var _rect: Rect2
var _camera: Camera2D
var _party: WorldTokens
var _nemici: Dictionary = {}   # combatant_id -> { "nome": String, "pos": Vector2 }
var _scatti: Dictionary = {}   # combatant_id -> { "t": float, "dir": Vector2 } (affondo d'attacco)
var _flash: Dictionary = {}    # combatant_id -> t: lampo bianco del colpo incassato
var _morenti: Array[Dictionary] = []   # { "nome", "pos", "t" }: token in dissolvenza di morte
var _respiro: float = 0.0      # orologio del RESPIRO dei token in combattimento
var _ultimo_zoom: float = 0.0


func configura(rect_mondo: Rect2, camera: Camera2D, party: WorldTokens) -> void:
	_rect = rect_mondo
	_camera = camera
	_party = party
	CombatManager.combatant_added.connect(_su_combattente_aggiunto)
	CombatManager.combatant_defeated.connect(_su_combattente_sconfitto)
	CombatManager.combatant_removed.connect(_su_combattente_rimosso)
	CombatManager.combat_ended.connect(_su_fine_scontro)
	# Il Mondo cucito e' L'UNICA mappa: quando l'IA muove un nemico (set_combatant_cell), il suo
	# token DEVE muoversi qui — avanzate, fughe e fiancheggiamenti si vedono sulla mappa vera.
	CombatManager.combatant_position_changed.connect(_su_cella_cambiata)
	# Lampo bianco quando un nemico INCASSA un colpo (game feel: il danno si vede sul token).
	CombatManager.combatant_damaged.connect(_su_danno_flash)
	set_process(true)


## Posizione MONDO del token di questo nemico (per WorldCombatFX), null se non e' in scena.
func posizione_di(combatant_id: String) -> Variant:
	if _nemici.has(combatant_id):
		return _nemici[combatant_id]["pos"] as Vector2
	return null


## Affondo d'attacco: il token scatta verso `direzione` e torna (lo anima WorldCombatFX).
func applica_scatto(combatant_id: String, direzione: Vector2) -> void:
	if _nemici.has(combatant_id):
		_scatti[combatant_id] = { "t": 0.0, "dir": direzione }
		queue_redraw()


func _su_combattente_aggiunto(combattente: Dictionary) -> void:
	if String(combattente.get("kind", "")) != "npc":
		return
	var id: String = String(combattente.get("id", ""))
	if id.is_empty():
		return
	var gittata: float = float(combattente.get("attackRange", 1))
	var distanza_celle: float = clampf(
		gittata if gittata > 1.0 else DISTANZA_MISCHIA_CELLE, DISTANZA_MISCHIA_CELLE, DISTANZA_MAX_CELLE
	)
	var centro: Vector2 = _party.centro_gruppo() if _party != null else _rect.get_center()
	var angolo: float = randf() * TAU
	var offset: Vector2 = Vector2.from_angle(angolo) * distanza_celle * PX_PER_CELLA
	# Lo spawn e' SNAPPATO al centro della sua cella: cosi' token e cella di combattimento
	# coincidono da subito (il gestore di combatant_position_changed rilegge lo stesso punto).
	var cella: Vector2i = _cella_di(_dentro_mappa(centro + offset))
	_nemici[id] = { "nome": String(combattente.get("name", "?")), "pos": _centro_cella(cella) }
	CombatManager.set_combatant_cell(id, cella)
	queue_redraw()


## Cella di combattimento di una posizione del mondo (scala fissa: 128 px = 1,5 m — la stessa
## dei token del party) e viceversa il centro-mondo di una cella.
func _cella_di(pos: Vector2) -> Vector2i:
	var locale: Vector2 = pos - _rect.position
	return Vector2i(
		maxi(0, floori(locale.x / PX_PER_CELLA)), maxi(0, floori(locale.y / PX_PER_CELLA)))


func _centro_cella(cella: Vector2i) -> Vector2:
	return _dentro_mappa(_rect.position
		+ Vector2((float(cella.x) + 0.5) * PX_PER_CELLA, (float(cella.y) + 0.5) * PX_PER_CELLA))


## L'IA (o il gioco) ha spostato un combattente: se e' uno dei nostri nemici, il token segue.
func _su_cella_cambiata(combatant_id: String, cella: Vector2i) -> void:
	if not _nemici.has(combatant_id):
		return
	var dest: Vector2 = _centro_cella(cella)
	if ((_nemici[combatant_id]["pos"] as Vector2)).distance_to(dest) < 0.5:
		return  # gia' li' (es. la cella appena registrata da noi allo spawn)
	_nemici[combatant_id]["pos"] = dest
	queue_redraw()


func _su_danno_flash(combatant_id: String, _amount: int, _hp: int) -> void:
	if _nemici.has(combatant_id):
		_flash[combatant_id] = 0.0
		queue_redraw()


func _su_combattente_sconfitto(combatant_id: String, _source_id: String) -> void:
	_scatti.erase(combatant_id)
	_flash.erase(combatant_id)
	if _nemici.has(combatant_id):
		# Il caduto non sparisce di colpo: passa tra i MORENTI e si dissolve ruotando (solo
		# visivo — la sua cella di gioco si libera SUBITO, il tattico non aspetta la regia).
		_morenti.append({
			"nome": String(_nemici[combatant_id]["nome"]),
			"pos": _nemici[combatant_id]["pos"], "t": 0.0,
		})
	if _nemici.erase(combatant_id):
		# La cella del caduto si libera (prima lo faceva la mappa tattica, ora rimossa):
		# fiancheggiamento e movimenti non devono piu' scansare un morto.
		CombatManager.clear_combatant_cell(combatant_id)
		queue_redraw()


func _su_combattente_rimosso(combatant_id: String) -> void:
	_scatti.erase(combatant_id)
	_flash.erase(combatant_id)
	if _nemici.erase(combatant_id):
		queue_redraw()


func _su_fine_scontro() -> void:
	_scatti.clear()
	_flash.clear()
	if _nemici.is_empty():
		return
	# Anche chi resta in scena a fine scontro (fughe, scontri chiusi dal Master) si dissolve.
	for id: String in _nemici.keys():
		_morenti.append({
			"nome": String(_nemici[id]["nome"]), "pos": _nemici[id]["pos"], "t": 0.0,
		})
	_nemici.clear()
	queue_redraw()


func _dentro_mappa(p: Vector2) -> Vector2:
	if _rect.size == Vector2.ZERO:
		return p
	return p.clamp(_rect.position, _rect.end)


func _process(delta: float) -> void:
	if _camera != null and not is_equal_approx(_camera.zoom.x, _ultimo_zoom):
		_ultimo_zoom = _camera.zoom.x
		queue_redraw()
	if not _scatti.is_empty():
		for id: String in _scatti.keys():
			_scatti[id]["t"] = float(_scatti[id]["t"]) + delta
		for id: String in _scatti.keys().filter(func(k: String) -> bool:
				return float(_scatti[k]["t"]) >= DURATA_SCATTO):
			_scatti.erase(id)
		queue_redraw()
	# RESPIRO in combattimento: i token oscillano piano — sono vivi, non pedine incollate.
	if CombatManager.is_active() and not _nemici.is_empty():
		_respiro += delta
		queue_redraw()
	if not _flash.is_empty():
		for id: String in _flash.keys():
			_flash[id] = float(_flash[id]) + delta
		for id: String in _flash.keys().filter(func(k: String) -> bool:
				return float(_flash[k]) >= DURATA_FLASH):
			_flash.erase(id)
		queue_redraw()
	if not _morenti.is_empty():
		for m: Dictionary in _morenti:
			m["t"] = float(m["t"]) + delta
		_morenti = _morenti.filter(func(m: Dictionary) -> bool:
			return float(m["t"]) < DURATA_MORTE)
		queue_redraw()


func _raggio() -> float:
	return maxf(RAGGIO_MONDO, RAGGIO_SCHERMO_MIN / maxf(_camera.zoom.x, 0.01))


## Spostamento corrente dell'affondo per un token (fuori e ritorno), Vector2.ZERO se non scatta.
func _offset_scatto(combatant_id: String, r: float) -> Vector2:
	if not _scatti.has(combatant_id):
		return Vector2.ZERO
	var p: float = clampf(float(_scatti[combatant_id]["t"]) / DURATA_SCATTO, 0.0, 1.0)
	return (_scatti[combatant_id]["dir"] as Vector2) * sin(p * PI) * r * 0.9


## Oscillazione del RESPIRO in combattimento (ampiezza minima, fase per-token dall'id: non
## respirano tutti all'unisono come un balletto). Fuori combattimento i token stanno fermi.
func _offset_respiro(combatant_id: String, r: float) -> Vector2:
	if not CombatManager.is_active():
		return Vector2.ZERO
	var fase: float = float(combatant_id.hash() % 628) / 100.0
	return Vector2(0.0, sin(_respiro * 2.6 + fase) * r * 0.06)


## I CADUTI in dissolvenza: il token ruota su se stesso, si stringe e svanisce (~0.9s) —
## disegnati SOTTO i vivi, che gli passano sopra.
func _disegna_morenti(r: float) -> void:
	for m: Dictionary in _morenti:
		var q: float = clampf(float(m["t"]) / DURATA_MORTE, 0.0, 1.0)
		var alfa: float = 1.0 - q * q
		draw_set_transform(m["pos"] as Vector2, 0.9 * q, Vector2.ONE * (1.0 - 0.25 * q))
		var tex: Texture2D = TokenArt.per_nome(String(m["nome"]))
		if tex != null:
			var lato: float = r * 2.4
			draw_texture_rect(tex, Rect2(-Vector2(lato, lato) * 0.5, Vector2(lato, lato)),
				false, Color(1, 1, 1, alfa))
		else:
			draw_circle(Vector2.ZERO, r, Color(COLORE, alfa))
	draw_set_transform(Vector2.ZERO)


func _draw() -> void:
	if _camera == null or (_nemici.is_empty() and _morenti.is_empty()):
		return
	var font: Font = ThemeDB.fallback_font
	var r: float = _raggio()
	_disegna_morenti(r)
	for id: String in _nemici.keys():
		var voce: Dictionary = _nemici[id]
		var pos: Vector2 = (voce["pos"] as Vector2) + _offset_scatto(id, r) \
			+ _offset_respiro(id, r)
		var nome: String = String(voce["nome"])
		var tex: Texture2D = TokenArt.per_nome(nome)
		if tex != null:
			var lato: float = r * 2.4
			draw_texture_rect(tex, Rect2(pos - Vector2(lato, lato) * 0.5, Vector2(lato, lato)), false)
		else:
			draw_circle(pos, r * 1.14, Color(0.08, 0.06, 0.05, 0.9))
			draw_circle(pos, r, COLORE)
			draw_circle(pos, r * 0.78, COLORE.lightened(0.16))
			draw_string(font, pos + Vector2(-r, r * 0.42), nome.left(1).to_upper(),
				HORIZONTAL_ALIGNMENT_CENTER, r * 2.0, int(r * 1.1), Color(0.95, 0.9, 0.88))
		# LAMPO BIANCO del colpo incassato: un velo sul token che svanisce in un quarto di secondo.
		if _flash.has(id):
			var qf: float = clampf(float(_flash[id]) / DURATA_FLASH, 0.0, 1.0)
			draw_circle(pos, r * 1.08, Color(1, 1, 1, (1.0 - qf) * 0.65))
		if _camera.zoom.x >= ZOOM_NOME:
			var dim_nome: int = int(maxf(16.0, r * 0.46))
			var y_nome: float = r * 1.5 + dim_nome
			draw_string(font, pos + Vector2(-r * 4 + 2, y_nome + 2), nome,
				HORIZONTAL_ALIGNMENT_CENTER, r * 8.0, dim_nome, Color(0, 0, 0, 0.75))
			draw_string(font, pos + Vector2(-r * 4, y_nome), nome,
				HORIZONTAL_ALIGNMENT_CENTER, r * 8.0, dim_nome, Color(0.92, 0.55, 0.5))
