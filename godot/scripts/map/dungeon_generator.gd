class_name DungeonGenerator
extends RefCounted
## Generatore procedurale di dungeon (Priorita' 1.3 del Nexus Map Engine).
##
## Due algoritmi, scelti dal tema:
## - BSP Tree (strutture costruite: cripte, roccaforti naniche, templi) — l'area viene divisa
##   ricorsivamente in foglie, ogni foglia ospita una stanza, le stanze sono collegate da
##   corridoi a L in catena (connettivita' garantita: ogni stanza raggiunge la successiva).
## - Cellular Automata (caverne naturali) — rumore iniziale + 5 passi della regola "muro se
##   >= 5 vicini muro", poi flood-fill per tenere SOLO la regione connessa piu' grande (niente
##   sacche irraggiungibili).
##
## E' logica PURA (static, nessun nodo): restituisce un Dictionary che il MapManager dipinge sui
## TileMapLayer. Cosi' si testa/rigenera senza scena, e in futuro puo' girare in un thread.

# Tipi di cella. L'indice e' ANCHE la colonna del tile nell'atlas generato dal MapManager.
const VUOTO: int = 0
const PAVIMENTO: int = 1
const MURO: int = 2
const PORTA: int = 3
const ACQUA: int = 4
const LAVA: int = 5
const MACERIE: int = 6
const PILASTRO: int = 7
const PONTE: int = 8
const ARCO: int = 9
const SCALA_GIU: int = 10   # scende al livello successivo del complesso
const SCALA_SU: int = 11    # risale al livello precedente
const TETTO: int = 12       # tetto di stanza (layer a scomparsa)
const TILE_COUNT: int = 13

const LARGHEZZA_DEFAULT: int = 48
const ALTEZZA_DEFAULT: int = 36
const MIN_FOGLIA: int = 9    # lato minimo di una foglia BSP (stanza + margini)
const MIN_STANZA: int = 4

const VICINI_8: Array[Vector2i] = [
	Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1), Vector2i(-1, 0),
	Vector2i(1, 0), Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1),
]


## Punto d'ingresso. tema: "cripta" | "roccaforte" | "tempio_lava" | "caverna".
## seme >= 0 per dungeon riproducibili (stesso seme = stessa mappa), -1 = casuale.
static func genera(tema: String = "cripta", seme: int = -1) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	if seme >= 0:
		rng.seed = seme
	else:
		rng.randomize()
	var seme_usato: int = int(rng.seed)

	var dati: Dictionary
	if tema == "caverna":
		dati = _genera_caverna(rng)
	else:
		dati = _genera_bsp(rng)
	dati["tema"] = tema
	dati["seme"] = seme_usato

	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	for chiave: String in ["muri", "props", "overhead"]:
		var strato := PackedInt32Array()
		strato.resize(w * h)
		dati[chiave] = strato

	_applica_tema(dati, tema, rng)
	_deriva_muri(dati)
	_piazza_porte(dati, rng)
	_piazza_props_e_torce(dati, tema, rng)
	return dati


## Collega verticalmente due livelli di un complesso multi-piano (roccaforte nanica): una SCALA_GIU
## sull'ultima stanza del livello sopra, una SCALA_SU sullo spawn del livello sotto. Chi scende
## arriva sulla scala che risale — coerenza spaziale del viaggio.
static func collega_livelli(sopra: Dictionary, sotto: Dictionary) -> void:
	var giu: Vector2i = _cella_per_scala(sopra)
	_imposta_scala(sopra, giu, SCALA_GIU)
	sopra["scala_giu"] = giu
	var su: Vector2i = sotto.get("spawn", Vector2i(2, 2))
	_imposta_scala(sotto, su, SCALA_SU)
	sotto["scala_su"] = su


static func _cella_per_scala(dati: Dictionary) -> Vector2i:
	var stanze: Array = dati["stanze"]
	if not stanze.is_empty():
		return (stanze[stanze.size() - 1] as Rect2i).get_center()
	# Caverna (nessuna stanza): l'ultima cella di pavimento trovata scandendo la griglia — che per
	# costruzione del flood-fill e' lontana dal punto di partenza.
	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	var celle: PackedInt32Array = dati["celle"]
	for i: int in range(w * h - 1, -1, -1):
		if celle[i] == PAVIMENTO:
			return Vector2i(i % w, i / w)
	return dati.get("spawn", Vector2i(2, 2))


static func _imposta_scala(dati: Dictionary, cell: Vector2i, tipo: int) -> void:
	var w: int = int(dati["larghezza"])
	var idx: int = cell.y * w + cell.x
	var celle: PackedInt32Array = dati["celle"]
	var props: PackedInt32Array = dati["props"]
	celle[idx] = tipo
	props[idx] = 0  # niente pilastri/macerie sopra una scala


# --- BSP: strutture costruite ---

static func _genera_bsp(rng: RandomNumberGenerator) -> Dictionary:
	var w: int = LARGHEZZA_DEFAULT
	var h: int = ALTEZZA_DEFAULT
	var celle := PackedInt32Array()
	celle.resize(w * h)  # tutto VUOTO (0)

	var foglie: Array[Rect2i] = []
	_dividi(Rect2i(1, 1, w - 2, h - 2), rng, foglie)

	var stanze: Array[Rect2i] = []
	for foglia: Rect2i in foglie:
		var sw: int = rng.randi_range(MIN_STANZA, maxi(MIN_STANZA, foglia.size.x - 2))
		var sh: int = rng.randi_range(MIN_STANZA, maxi(MIN_STANZA, foglia.size.y - 2))
		var sx: int = foglia.position.x + rng.randi_range(1, maxi(1, foglia.size.x - sw - 1))
		var sy: int = foglia.position.y + rng.randi_range(1, maxi(1, foglia.size.y - sh - 1))
		var stanza := Rect2i(sx, sy, sw, sh)
		stanze.append(stanza)
		_riempi_rect(celle, w, stanza, PAVIMENTO)

	# Catena di corridoi ordinata per x del centro: ogni stanza e' collegata alla successiva,
	# quindi il grafo e' connesso per costruzione. Qualche collegamento extra casuale crea anelli.
	stanze.sort_custom(func(a: Rect2i, b: Rect2i) -> bool: return a.get_center().x < b.get_center().x)
	for i: int in range(stanze.size() - 1):
		_corridoio(celle, w, stanze[i].get_center(), stanze[i + 1].get_center(), rng)
	@warning_ignore("integer_division")  # un quarto delle stanze (arrotondato in giu'): voluto
	for _i: int in range(maxi(1, stanze.size() / 4)):
		var a: Rect2i = stanze[rng.randi() % stanze.size()]
		var b: Rect2i = stanze[rng.randi() % stanze.size()]
		_corridoio(celle, w, a.get_center(), b.get_center(), rng)

	return {
		"larghezza": w, "altezza": h, "celle": celle,
		"stanze": stanze, "spawn": stanze[0].get_center() if not stanze.is_empty() else Vector2i(2, 2),
	}


static func _dividi(area: Rect2i, rng: RandomNumberGenerator, foglie: Array[Rect2i]) -> void:
	var puo_orizz: bool = area.size.y >= MIN_FOGLIA * 2
	var puo_vert: bool = area.size.x >= MIN_FOGLIA * 2
	if not puo_orizz and not puo_vert:
		foglie.append(area)
		return
	var orizz: bool = rng.randf() < 0.5 if (puo_orizz and puo_vert) else puo_orizz
	if orizz:
		var taglio: int = rng.randi_range(MIN_FOGLIA, area.size.y - MIN_FOGLIA)
		_dividi(Rect2i(area.position, Vector2i(area.size.x, taglio)), rng, foglie)
		_dividi(Rect2i(area.position + Vector2i(0, taglio), Vector2i(area.size.x, area.size.y - taglio)), rng, foglie)
	else:
		var taglio: int = rng.randi_range(MIN_FOGLIA, area.size.x - MIN_FOGLIA)
		_dividi(Rect2i(area.position, Vector2i(taglio, area.size.y)), rng, foglie)
		_dividi(Rect2i(area.position + Vector2i(taglio, 0), Vector2i(area.size.x - taglio, area.size.y)), rng, foglie)


static func _riempi_rect(celle: PackedInt32Array, w: int, rect: Rect2i, tipo: int) -> void:
	for y: int in range(rect.position.y, rect.end.y):
		for x: int in range(rect.position.x, rect.end.x):
			celle[y * w + x] = tipo


## Corridoio a L fra due punti (prima orizzontale poi verticale, o viceversa, a caso).
static func _corridoio(celle: PackedInt32Array, w: int, da: Vector2i, a: Vector2i, rng: RandomNumberGenerator) -> void:
	var gomito := Vector2i(a.x, da.y) if rng.randf() < 0.5 else Vector2i(da.x, a.y)
	_scava_linea(celle, w, da, gomito)
	_scava_linea(celle, w, gomito, a)


static func _scava_linea(celle: PackedInt32Array, w: int, da: Vector2i, a: Vector2i) -> void:
	var passo := Vector2i(signi(a.x - da.x), signi(a.y - da.y))
	var cur: Vector2i = da
	celle[cur.y * w + cur.x] = maxi(celle[cur.y * w + cur.x], PAVIMENTO)
	while cur != a:
		cur += passo
		if celle[cur.y * w + cur.x] == VUOTO:
			celle[cur.y * w + cur.x] = PAVIMENTO


## sign() di Godot ritorna float: versione intera per i passi di griglia.
static func signi(v: int) -> int:
	return 0 if v == 0 else (1 if v > 0 else -1)


# --- Cellular Automata: caverne naturali ---

static func _genera_caverna(rng: RandomNumberGenerator) -> Dictionary:
	var w: int = LARGHEZZA_DEFAULT
	var h: int = ALTEZZA_DEFAULT
	var muro := PackedByteArray()
	muro.resize(w * h)
	for y: int in range(h):
		for x: int in range(w):
			var bordo: bool = x == 0 or y == 0 or x == w - 1 or y == h - 1
			muro[y * w + x] = 1 if (bordo or rng.randf() < 0.44) else 0

	# 5 passi dell'automa: una cella diventa muro se ha >= 5 vicini muro (leviga il rumore in grotte).
	for _passo: int in range(5):
		var nuovo := PackedByteArray()
		nuovo.resize(w * h)
		for y: int in range(h):
			for x: int in range(w):
				var vicini: int = 0
				for d: Vector2i in VICINI_8:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if nx < 0 or ny < 0 or nx >= w or ny >= h or muro[ny * w + nx] == 1:
						vicini += 1
				nuovo[y * w + x] = 1 if vicini >= 5 else 0
		muro = nuovo

	# Flood-fill dalla zona centrale: tiene SOLO la regione connessa piu' grande raggiungibile.
	var celle := PackedInt32Array()
	celle.resize(w * h)
	var partenza := Vector2i(-1, -1)
	for raggio: int in range(maxi(w, h)):
		for d: Vector2i in [Vector2i(0, 0)] + VICINI_8:
			@warning_ignore("integer_division")  # centro della griglia in celle: intero voluto
			var c := Vector2i(w / 2 + d.x * raggio, h / 2 + d.y * raggio)
			if c.x > 0 and c.y > 0 and c.x < w - 1 and c.y < h - 1 and muro[c.y * w + c.x] == 0:
				partenza = c
				break
		if partenza.x >= 0:
			break
	var pila: Array[Vector2i] = [partenza]
	var visitate: Dictionary = {}
	while not pila.is_empty():
		var c: Vector2i = pila.pop_back()
		var idx: int = c.y * w + c.x
		if visitate.has(idx) or muro[idx] == 1:
			continue
		visitate[idx] = true
		celle[idx] = PAVIMENTO
		for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var n: Vector2i = c + d
			if n.x >= 0 and n.y >= 0 and n.x < w and n.y < h:
				pila.append(n)

	return { "larghezza": w, "altezza": h, "celle": celle, "stanze": [] as Array[Rect2i], "spawn": partenza }


# --- Temi: lava, acqua, atmosfera ---

static func _applica_tema(dati: Dictionary, tema: String, rng: RandomNumberGenerator) -> void:
	match tema:
		"roccaforte":
			_scava_fiume(dati, rng, 1)
		"tempio_lava":
			_scava_fiume(dati, rng, 2)
		"caverna":
			_pozze_acqua(dati, rng)
		_:
			pass  # cripta: solo pietra e ossa (macerie), niente fluidi


## Fiume di lava che attraversa la mappa da ovest a est (random walk verticale). Dove incrocia un
## pavimento gia' scavato diventa PONTE (passerella) — la connettivita' delle stanze NON si rompe —
## con un ARCO in overhead (il tocco 2.5D: l'arco si disegna SOPRA i token che ci passano sotto).
static func _scava_fiume(dati: Dictionary, rng: RandomNumberGenerator, spessore: int) -> void:
	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	var celle: PackedInt32Array = dati["celle"]
	var overhead: PackedInt32Array = dati["overhead"]
	@warning_ignore("integer_division")  # banda centrale della mappa (celle): interi voluti
	var y: int = rng.randi_range(h / 4, h * 3 / 4)
	for x: int in range(w):
		for dy: int in range(spessore):
			var cy: int = clampi(y + dy, 1, h - 2)
			var idx: int = cy * w + x
			if celle[idx] == PAVIMENTO:
				celle[idx] = PONTE
				if rng.randf() < 0.4:
					overhead[idx] = ARCO
			else:
				celle[idx] = LAVA
		y = clampi(y + rng.randi_range(-1, 1), 2, h - 3)


## Pozze d'acqua nelle caverne: celle di pavimento con tutto pavimento intorno, a macchie.
static func _pozze_acqua(dati: Dictionary, rng: RandomNumberGenerator) -> void:
	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	var celle: PackedInt32Array = dati["celle"]
	for y: int in range(2, h - 2):
		for x: int in range(2, w - 2):
			if celle[y * w + x] != PAVIMENTO or rng.randf() >= 0.03:
				continue
			var tutti_pavimento: bool = true
			for d: Vector2i in VICINI_8:
				if celle[(y + d.y) * w + (x + d.x)] != PAVIMENTO and celle[(y + d.y) * w + (x + d.x)] != ACQUA:
					tutti_pavimento = false
					break
			if tutti_pavimento:
				celle[y * w + x] = ACQUA
				for d: Vector2i in VICINI_8:
					if rng.randf() < 0.5:
						celle[(y + d.y) * w + (x + d.x)] = ACQUA


# --- Derivazione muri, porte, props, torce ---

## Ogni cella VUOTA adiacente (8 direzioni) a una cella percorribile/fluida diventa MURO: le pareti
## "abbracciano" gli spazi scavati, come in ogni dungeon disegnato a mano.
static func _deriva_muri(dati: Dictionary) -> void:
	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	var celle: PackedInt32Array = dati["celle"]
	var muri: PackedInt32Array = dati["muri"]
	for y: int in range(h):
		for x: int in range(w):
			if celle[y * w + x] != VUOTO:
				continue
			for d: Vector2i in VICINI_8:
				var nx: int = x + d.x
				var ny: int = y + d.y
				if nx < 0 or ny < 0 or nx >= w or ny >= h:
					continue
				if celle[ny * w + nx] != VUOTO:
					muri[y * w + x] = MURO
					break


## Porte sulle strozzature: cella di pavimento con muro sopra+sotto e pavimento ai lati (o ruotato)
## e' il collo di un corridoio — classica posizione di una porta. Non tutte: il 35%.
static func _piazza_porte(dati: Dictionary, rng: RandomNumberGenerator) -> void:
	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	var celle: PackedInt32Array = dati["celle"]
	var muri: PackedInt32Array = dati["muri"]
	for y: int in range(1, h - 1):
		for x: int in range(1, w - 1):
			if celle[y * w + x] != PAVIMENTO or rng.randf() >= 0.35:
				continue
			var muro_vert: bool = muri[(y - 1) * w + x] == MURO and muri[(y + 1) * w + x] == MURO
			var pav_orizz: bool = celle[y * w + x - 1] == PAVIMENTO and celle[y * w + x + 1] == PAVIMENTO
			var muro_orizz: bool = muri[y * w + x - 1] == MURO and muri[y * w + x + 1] == MURO
			var pav_vert: bool = celle[(y - 1) * w + x] == PAVIMENTO and celle[(y + 1) * w + x] == PAVIMENTO
			if (muro_vert and pav_orizz) or (muro_orizz and pav_vert):
				muri[y * w + x] = PORTA


static func _piazza_props_e_torce(dati: Dictionary, tema: String, rng: RandomNumberGenerator) -> void:
	var w: int = int(dati["larghezza"])
	var h: int = int(dati["altezza"])
	var celle: PackedInt32Array = dati["celle"]
	var muri: PackedInt32Array = dati["muri"]
	var props: PackedInt32Array = dati["props"]
	var torce: Array[Vector2i] = []
	var passo_torce: int = 12 if tema == "tempio_lava" else 8  # la lava illumina gia' da sola
	var prob_macerie: float = 0.04 if tema == "cripta" else 0.02

	# Pilastri agli angoli interni delle stanze grandi (solo strutture BSP).
	for stanza: Rect2i in dati["stanze"]:
		if stanza.size.x >= 7 and stanza.size.y >= 7:
			for angolo: Vector2i in [
				stanza.position + Vector2i(1, 1), Vector2i(stanza.end.x - 2, stanza.position.y + 1),
				Vector2i(stanza.position.x + 1, stanza.end.y - 2), stanza.end - Vector2i(2, 2),
			]:
				props[angolo.y * w + angolo.x] = PILASTRO

	for y: int in range(h):
		for x: int in range(w):
			var idx: int = y * w + x
			if celle[idx] != PAVIMENTO or props[idx] != 0:
				continue
			# Torce: a intervalli regolari (hash deterministico + tema) sulle celle a ridosso dei muri.
			var vicino_a_muro: bool = false
			for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				if muri[(y + d.y) * w + (x + d.x)] == MURO:
					vicino_a_muro = true
					break
			if vicino_a_muro and (x * 7 + y * 13) % passo_torce == 0:
				torce.append(Vector2i(x, y))
			elif rng.randf() < prob_macerie:
				props[idx] = MACERIE
	dati["torce"] = torce
