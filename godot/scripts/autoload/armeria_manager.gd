extends Node
## ArmeriaManager (Autoload singleton) — porting del Modulo 41 JS "Armeria: Rarita', Armature,
## Amuleti, Drop Scalati".
##
## Registra nel catalogo di InventoryManager gli oggetti con RARITA' (rara/epica/leggendaria: armi
## con bonus cotto nelle statistiche, armature, amuleti, consumabili potenti) e calcola i drop dei
## nemici scalati sulla loro FORZA (XP/CR): piu' un nemico e' forte, piu' e' probabile che lasci
## qualcosa di potente. Tutta la logica di probabilita' e' pura e testabile.
##
## Registrazione: Project Settings > Autoload -> "ArmeriaManager" (dopo InventoryManager).

const ARMERIA_PATH: String = "res://data/armeria.json"

var rarita: Dictionary = {}
var catalogo: Array[Dictionary] = []


func _ready() -> void:
	if not FileAccess.file_exists(ARMERIA_PATH):
		push_warning("ArmeriaManager: catalogo non trovato: " + ARMERIA_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(ARMERIA_PATH))
	if not (parsed is Dictionary):
		return
	rarita = parsed.get("rarita", {})
	for entry: Variant in parsed.get("oggetti", []):
		if entry is Dictionary:
			catalogo.append(entry)
	InventoryManager.register_catalog_items(catalogo)


## Probabilita' che un nemico lasci un drop dell'armeria, in funzione della sua "potenza" (XP 5e).
func probabilita_drop(potenza: int) -> float:
	return minf(0.85, 0.22 + float(potenza) / 260.0)


## Estrae la rarita' del drop (o "comune" = nessun oggetto dell'armeria). rng: funzione 0..1
## iniettabile per i test deterministici.
func roll_rarita(potenza: int, rng: Callable = func() -> float: return randf()) -> String:
	var p: float = float(potenza)
	var r: float = rng.call()
	var p_leggendaria: float = minf(0.10, p / 2500.0)
	var p_epica: float = minf(0.22, p / 650.0)
	var p_rara: float = minf(0.50, 0.10 + p / 260.0)
	if r < p_leggendaria:
		return "leggendaria"
	if r < p_leggendaria + p_epica:
		return "epica"
	if r < p_leggendaria + p_epica + p_rara:
		return "rara"
	return "comune"


func oggetti_per_rarita(rarita_key: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for o: Dictionary in catalogo:
		if String(o.get("rarity", "")) == rarita_key:
			out.append(o)
	return out


## Ritorna gli id degli oggetti dell'armeria lasciati cadere dal nemico (0-2). "comune" non genera
## drop dall'armeria (quel bottino arriva dalle tabelle base di ProgressionManager).
func roll_drop_nemico(potenza: int, rng: Callable = func() -> float: return randf()) -> Array[String]:
	var out: Array[String] = []
	if rng.call() >= probabilita_drop(potenza):
		return out
	var r: String = roll_rarita(potenza, rng)
	if r != "comune":
		var pool: Array[Dictionary] = oggetti_per_rarita(r)
		if not pool.is_empty():
			out.append(String(pool[int(rng.call() * pool.size()) % pool.size()]["id"]))
	# I nemici molto forti possono lasciare un secondo oggetto.
	if potenza >= 100 and rng.call() < minf(0.35, float(potenza) / 900.0):
		var r2: String = roll_rarita(potenza, rng)
		if r2 != "comune":
			var pool2: Array[Dictionary] = oggetti_per_rarita(r2)
			if not pool2.is_empty():
				out.append(String(pool2[int(rng.call() * pool2.size()) % pool2.size()]["id"]))
	return out


func rarita_di(catalog_id: String) -> String:
	for o: Dictionary in catalogo:
		if String(o.get("id", "")) == catalog_id:
			return String(o.get("rarity", ""))
	return ""


func colore_rarita(rarita_key: String) -> Color:
	var voce: Dictionary = rarita.get(rarita_key, rarita.get("comune", {}))
	return Color(String(voce.get("colore", "#b8ab90")))
