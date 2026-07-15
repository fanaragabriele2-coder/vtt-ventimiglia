extends Node
## MerchantManager (Autoload) — i MERCANTI del mondo.
##
## Carica i mercanti della campagna attiva (data/mercanti_<campagna>.json): ognuno vive in un
## LUOGO della mappa (nome di un'etichetta del set) e vende oggetti veri del catalogo
## (items.json / armeria.json) a prezzi in ORO. L'oro e' la borsa comune del party
## (ProgressionManager: bottini, ricompense di storia e di quest).
##
## Il layer WorldNpcs disegna i loro marker accanto ai luoghi; il MerchantPanel mostra il
## listino e chiama compra(): se l'oro basta, l'oggetto finisce nello zaino
## (InventoryManager.add_item) e la spesa viene annunciata in chat.

signal mercanti_caricati

var _mercanti: Array[Dictionary] = []


func _ready() -> void:
	_carica()
	GameState.event_published.connect(func(nome_evento: String, _p: Variant) -> void:
		if nome_evento == "campagna:cambiata":
			_carica()
			mercanti_caricati.emit())


## Tutti i mercanti della campagna attiva (per il layer marker e il pannello).
func mercanti() -> Array[Dictionary]:
	return _mercanti


## Il mercante che sta in un luogo (Dictionary vuoto se il posto non ha bottega).
func mercante_a(luogo: String) -> Dictionary:
	for m: Dictionary in _mercanti:
		if String(m.get("luogo", "")) == luogo:
			return m
	return {}


func mercante_per_id(id: String) -> Dictionary:
	for m: Dictionary in _mercanti:
		if String(m.get("id", "")) == id:
			return m
	return {}


## Compra un oggetto dal listino: controlla il prezzo, spende dalla borsa comune, mette
## l'oggetto nello zaino. Ritorna true se l'acquisto e' andato in porto.
func compra(mercante_id: String, item_id: String) -> bool:
	var mercante: Dictionary = mercante_per_id(mercante_id)
	if mercante.is_empty():
		return false
	var prezzo: int = -1
	for voce: Variant in mercante.get("listino", []):
		if voce is Dictionary and String((voce as Dictionary).get("item", "")) == item_id:
			prezzo = int((voce as Dictionary).get("prezzo", -1))
			break
	if prezzo < 0:
		return false
	if not ProgressionManager.spendi_oro(prezzo):
		GameState.announce("💰 Oro insufficiente: servono %d monete (ne avete %d)." % [
			prezzo, ProgressionManager.oro_totale(),
		])
		return false
	var entry: Dictionary = InventoryManager.add_item(item_id, 1)
	if entry.is_empty():
		# Oggetto sconosciuto al catalogo: l'oro torna indietro (non deve mai sparire nel nulla).
		ProgressionManager.get_prog(_id_attivo())["gold"] = \
			int(ProgressionManager.get_prog(_id_attivo()).get("gold", 0)) + prezzo
		return false
	var nome: String = String(InventoryManager.item_definition(item_id).get("name", item_id))
	GameState.announce("🛒 Comprato: %s per %d oro (restano %d monete)." % [
		nome, prezzo, ProgressionManager.oro_totale(),
	])
	return true


func _id_attivo() -> String:
	var pg: CharacterData = CharacterManager.get_active()
	return pg.id if pg else ""


func _carica() -> void:
	_mercanti.clear()
	var percorso: String = "res://data/mercanti_%s.json" % CampaignDirector.campagna_attuale_id()
	if not FileAccess.file_exists(percorso):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(percorso))
	if not (dati is Dictionary):
		return
	for m: Variant in (dati as Dictionary).get("mercanti", []):
		if m is Dictionary:
			_mercanti.append(m)
