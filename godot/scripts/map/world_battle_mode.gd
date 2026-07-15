class_name WorldBattleMode
extends Node2D
## La MAPPA che si TRASFORMA in battaglia (stile BG3): quando parte uno scontro il Mondo cucito
## diventa l'arena tattica — senza cambiare vista.
##
## A combat_started:
## - calcola l'ARENA (il riquadro che contiene tutti i combattenti + margine) e ci STRINGE la
##   camera sopra (planata morbida della VTTCamera);
## - OSCURA tutto cio' che sta fuori dall'arena (penombra da regia: l'occhio va sullo scontro);
## - accende una GRIGLIA TATTICA locale solo dentro l'arena (1 cella = 128 px = 1,5 m), senza
##   toccare la griglia globale dell'utente;
## - EVIDENZIA gli ostacoli: bordo dorato sulle celle di COPERTURA (doppio bordo = massiccia,
##   quella che blocca la linea di vista) e triangolo verde con la quota sulle ALTURE;
## - ambience "battaglia" (tamburi).
## Se lo scontro DERIVA fuori dall'arena (inseguimenti, fughe), l'arena si allarga da sola a
## ogni cambio turno. A fine scontro tutto torna esplorazione: camera piu' larga sul party,
## penombra via, ambience della regione (o automatica fuori dalla Terra di Mezzo).

const PX_PER_CELLA: float = 128.0
const MARGINE_CELLE: float = 4.0
const COL_PENOMBRA: Color = Color(0, 0, 0, 0.34)
const COL_GRIGLIA: Color = Color(0.85, 0.7, 0.3, 0.16)
const COL_BORDO_ARENA: Color = Color(0.85, 0.7, 0.3, 0.5)
const COL_COPERTURA: Color = Color(0.9, 0.75, 0.32, 0.85)
const COL_COPERTURA_MURO: Color = Color(0.95, 0.5, 0.2, 0.95)
const COL_ALTURA: Color = Color(0.45, 0.8, 0.4, 0.85)

var _rect: Rect2
var _camera: VTTCamera
var _party: WorldTokens
var _nemici: WorldEnemyTokens
var _arena: Rect2
var _attivo: bool = false


func configura(rect_mondo: Rect2, camera: VTTCamera, party: WorldTokens,
		nemici: WorldEnemyTokens) -> void:
	_rect = rect_mondo
	_camera = camera
	_party = party
	_nemici = nemici
	CombatManager.combat_started.connect(_su_inizio)
	CombatManager.combat_ended.connect(_su_fine)
	CombatManager.turn_changed.connect(_su_turno)
	ElevationManager.elevation_painted.connect(_su_quota_dipinta)
	# Builder ricreato ("Ricarica mappe") A SCONTRO IN CORSO: la modalita' battaglia si riattiva.
	if CombatManager.is_active():
		_su_inizio()


func _su_inizio() -> void:
	_attivo = true
	_arena = _calcola_arena()
	_camera.adatta_a(_arena)
	if AmbienceManager.is_attiva():
		AmbienceManager.imposta_scena("battaglia")
	GameState.announce("⚔ La regia si stringe sull'arena: griglia tattica, coperture e "
		+ "alture in evidenza.")
	queue_redraw()


func _su_fine() -> void:
	_attivo = false
	var centro: Vector2 = _party.centro_gruppo() if _party != null else _rect.get_center()
	# Vista d'esplorazione: un riquadro largo attorno al party (non l'intero mondo).
	_camera.adatta_a(Rect2(centro - Vector2(2400, 1500), Vector2(4800, 3000)).intersection(_rect))
	if AmbienceManager.is_attiva():
		AmbienceManager.imposta_scena(_scena_di_regione(centro))
	queue_redraw()


## L'ambience giusta dopo lo scontro: quella della regione (Terra di Mezzo) o l'automatica.
func _scena_di_regione(centro: Vector2) -> String:
	if CampaignDirector.campagna_attuale_id() == "ventimiglia":
		return ""
	return String(JourneyEvents.regione_di(centro).get("scena", ""))


## A ogni cambio turno: se qualcuno e' finito FUORI dall'arena (fughe, inseguimenti), l'arena
## si allarga a comprenderlo e la camera segue.
func _su_turno(_id: String, _round: int) -> void:
	if not _attivo:
		return
	var necessaria: Rect2 = _bbox_combattenti()
	if necessaria.size == Vector2.ZERO or _arena.encloses(necessaria):
		return
	_arena = _con_margine(_arena.merge(necessaria))
	_camera.adatta_a(_arena)
	queue_redraw()


func _su_quota_dipinta(_x: int, _y: int, _raggio: int, _livello: int) -> void:
	if _attivo:
		queue_redraw()


# --- Geometria dell'arena ---

## Il riquadro di tutti i combattenti col token in scena, con margine, dentro la mappa.
func _calcola_arena() -> Rect2:
	var bbox: Rect2 = _bbox_combattenti()
	if bbox.size == Vector2.ZERO:
		var centro: Vector2 = _party.centro_gruppo() if _party != null else _rect.get_center()
		bbox = Rect2(centro, Vector2.ZERO)
	return _con_margine(bbox)


func _bbox_combattenti() -> Rect2:
	var bbox: Rect2 = Rect2()
	var primo: bool = true
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		var id: String = String(comb.get("id", ""))
		var pos: Variant = _party.posizione_di(id) if String(comb.get("kind", "")) == "pc" \
			else _nemici.posizione_di(id)
		if pos == null:
			continue
		if primo:
			bbox = Rect2(pos as Vector2, Vector2.ZERO)
			primo = false
		else:
			bbox = bbox.expand(pos as Vector2)
	return bbox


func _con_margine(r: Rect2) -> Rect2:
	return r.grow(MARGINE_CELLE * PX_PER_CELLA).intersection(_rect)


# --- Disegno: penombra, griglia locale, coperture, alture ---

func _draw() -> void:
	if not _attivo or _rect.size == Vector2.ZERO or _arena.size == Vector2.ZERO:
		return
	_disegna_penombra()
	_disegna_griglia_locale()
	draw_rect(_arena, COL_BORDO_ARENA, false, 6.0)
	_disegna_coperture()
	_disegna_alture()


## Quattro veli scuri attorno all'arena: il mondo resta visibile, ma l'occhio va sullo scontro.
func _disegna_penombra() -> void:
	var sopra := Rect2(_rect.position, Vector2(_rect.size.x, _arena.position.y - _rect.position.y))
	var sotto := Rect2(Vector2(_rect.position.x, _arena.end.y),
		Vector2(_rect.size.x, _rect.end.y - _arena.end.y))
	var sinistra := Rect2(Vector2(_rect.position.x, _arena.position.y),
		Vector2(_arena.position.x - _rect.position.x, _arena.size.y))
	var destra := Rect2(Vector2(_arena.end.x, _arena.position.y),
		Vector2(_rect.end.x - _arena.end.x, _arena.size.y))
	for velo: Rect2 in [sopra, sotto, sinistra, destra]:
		if velo.size.x > 0.0 and velo.size.y > 0.0:
			draw_rect(velo, COL_PENOMBRA)


## Griglia tattica SOLO dentro l'arena, allineata alle celle di combattimento del mondo.
func _disegna_griglia_locale() -> void:
	var x: float = _rect.position.x \
		+ ceilf((_arena.position.x - _rect.position.x) / PX_PER_CELLA) * PX_PER_CELLA
	while x <= _arena.end.x:
		draw_line(Vector2(x, _arena.position.y), Vector2(x, _arena.end.y), COL_GRIGLIA, 2.0)
		x += PX_PER_CELLA
	var y: float = _rect.position.y \
		+ ceilf((_arena.position.y - _rect.position.y) / PX_PER_CELLA) * PX_PER_CELLA
	while y <= _arena.end.y:
		draw_line(Vector2(_arena.position.x, y), Vector2(_arena.end.x, y), COL_GRIGLIA, 2.0)
		y += PX_PER_CELLA


## Bordo dorato sulle celle di copertura dentro l'arena; il MURO (livello 2, blocca la linea di
## vista) ha doppio bordo piu' acceso.
func _disegna_coperture() -> void:
	for k: String in CoverManager.celle_registrate():
		var parti: PackedStringArray = k.split(",")
		if parti.size() != 2:
			continue
		var cella := Vector2i(int(parti[0]), int(parti[1]))
		var r: Rect2 = _rect_cella(cella)
		if not _arena.intersects(r):
			continue
		var livello: int = CoverManager.copertura_di(cella.x, cella.y)
		var colore: Color = COL_COPERTURA_MURO if livello >= 2 else COL_COPERTURA
		draw_rect(r.grow(-8.0), colore, false, 4.0)
		if livello >= 2:
			draw_rect(r.grow(-20.0), colore, false, 3.0)


## Triangolo verde + quota sulle celle sopraelevate dentro l'arena.
func _disegna_alture() -> void:
	var font: Font = ThemeDB.fallback_font
	for k: String in ElevationManager.celle_dipinte():
		var parti: PackedStringArray = k.split(",")
		if parti.size() != 2:
			continue
		var cella := Vector2i(int(parti[0]), int(parti[1]))
		var r: Rect2 = _rect_cella(cella)
		if not _arena.intersects(r):
			continue
		var quota: int = ElevationManager.quota_di(cella.x, cella.y)
		var centro: Vector2 = r.get_center()
		var mezzo: float = PX_PER_CELLA * 0.16
		draw_colored_polygon(PackedVector2Array([
			centro + Vector2(0, -mezzo), centro + Vector2(mezzo, mezzo * 0.7),
			centro + Vector2(-mezzo, mezzo * 0.7),
		]), COL_ALTURA)
		draw_string(font, centro + Vector2(-40, mezzo + 26), "+%d" % quota,
			HORIZONTAL_ALIGNMENT_CENTER, 80.0, 24, COL_ALTURA)


func _rect_cella(cella: Vector2i) -> Rect2:
	return Rect2(_rect.position + Vector2(cella.x, cella.y) * PX_PER_CELLA,
		Vector2(PX_PER_CELLA, PX_PER_CELLA))
