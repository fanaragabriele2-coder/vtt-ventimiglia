extends Node
## ElevationManager (Autoload singleton) — porting del Modulo 28 JS "Terreno Sopraelevato" (stile
## BG3). Quota per cella (livello intero, 0 = terreno normale): attaccare da una quota piu' alta
## di quella del bersaglio da vantaggio; da una quota piu' bassa da svantaggio.
##
## Registrazione: Project Settings > Autoload -> "ElevationManager" (dopo CombatManager).

signal elevation_painted(cell_x: int, cell_y: int, radius: int, level: int)

var _quote: Dictionary = {}   # "x,y" -> livello (int); celle assenti = quota 0


func _chiave(cell_x: int, cell_y: int) -> String:
	return "%d,%d" % [cell_x, cell_y]


func quota_di(cell_x: int, cell_y: int) -> int:
	return int(_quote.get(_chiave(cell_x, cell_y), 0))


static func differenza_elevazione(quota_attaccante: int, quota_bersaglio: int) -> int:
	return quota_attaccante - quota_bersaglio


## "advantage" se l'attaccante e' piu' in alto, "disadvantage" se piu' in basso, "normal" a parita'.
static func vantaggio_per_elevazione(quota_attaccante: int, quota_bersaglio: int) -> String:
	var d: int = differenza_elevazione(quota_attaccante, quota_bersaglio)
	if d > 0:
		return "advantage"
	if d < 0:
		return "disadvantage"
	return "normal"


## Sovrapposizione 5e generalizzata a piu' fonti: se c'e' ALMENO una fonte di vantaggio e almeno
## una di svantaggio, si annullano (torna "normale"); altrimenti vince quella presente.
static func componi_modalita(modalita_scelta: String, ha_vantaggio_extra: bool, ha_svantaggio_extra: bool) -> String:
	var vantaggio: bool = ha_vantaggio_extra or modalita_scelta == "advantage"
	var svantaggio: bool = ha_svantaggio_extra or modalita_scelta == "disadvantage"
	if vantaggio and svantaggio:
		return "normal"
	if vantaggio:
		return "advantage"
	if svantaggio:
		return "disadvantage"
	return "normal"


## Lettura live: vantaggio/svantaggio per una coppia attaccante/bersaglio dalle loro posizioni
## correnti in CombatManager. "normal" se una posizione non e' nota.
func valuta_elevazione(attaccante_id: String, bersaglio_id: String) -> String:
	var cella_att: Variant = CombatManager.get_combatant_cell(attaccante_id)
	var cella_ber: Variant = CombatManager.get_combatant_cell(bersaglio_id)
	if cella_att == null or cella_ber == null:
		return "normal"
	return vantaggio_per_elevazione(quota_di(cella_att.x, cella_att.y), quota_di(cella_ber.x, cella_ber.y))


## Dipinge la quota su un'area circolare (raggio in celle, Chebyshev). livello 0 rimuove l'override.
func imposta_area(cell_x: int, cell_y: int, radius: int, level: int) -> void:
	for dx: int in range(-radius, radius + 1):
		for dy: int in range(-radius, radius + 1):
			if maxi(absi(dx), absi(dy)) > radius:
				continue
			var k: String = _chiave(cell_x + dx, cell_y + dy)
			if level == 0:
				_quote.erase(k)
			else:
				_quote[k] = level
	var segno: String = ("+%d" % level) if level >= 0 else str(level)
	GameState.announce("⛰ Quota %s impostata in (%d,%d), raggio %d." % [segno, cell_x, cell_y, radius])
	elevation_painted.emit(cell_x, cell_y, radius, level)


## Tutte le celle con quota diversa da zero (per il disegno dell'overlay sulla mappa).
func celle_dipinte() -> Dictionary:
	return _quote.duplicate(true)


func reset() -> void:
	_quote.clear()
