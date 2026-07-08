extends Node
## LocalGameManager (Autoload) — coordinatore della partita in LOCALE (couch play / hotseat).
##
## DIRETTIVA ARCHITETTURALE: il VTT gira su UN solo PC collegato allo schermo al centro del tavolo.
## Nessun netcode, nessun WebSocket, nessuna sincronizzazione host-authoritative: la Fase 4 "rete"
## della roadmap e' ANNULLATA (vedi docs/NEXUS_ARCHITETTURA.md). Tutto lo stato di gioco vive in
## MEMORIA nei manager esistenti (CharacterManager, CombatManager, InventoryManager...) e vi si
## accede direttamente: qui NON esiste alcuna serializzazione JSON per la rete — il JSON resta solo
## per i salvataggi locali su disco (SaveManager) e i cataloghi dati.
##
## Responsabilita' (e SOLO queste — i turni di combattimento restano di CombatManager, fonte unica):
## - il "posto" hotseat: a chi e' in mano il mouse/controller condiviso (rotazione del PG attivo);
## - la modalita' Master: quando attiva, chi ha il mouse muove QUALSIASI token (anche i nemici);
## - gli annunci da tavolo: con uno schermo condiviso serve dire A TUTTI di chi e' il momento.

signal posto_cambiato(indice: int, nome: String)
signal modalita_master_cambiata(attiva: bool)

var _modalita_master: bool = true  # di default il Master guida: muove tutti i token col mouse


func _ready() -> void:
	CombatManager.turn_changed.connect(_on_turn_changed)


func is_modalita_master() -> bool:
	return _modalita_master


func set_modalita_master(attiva: bool) -> void:
	if attiva == _modalita_master:
		return
	_modalita_master = attiva
	modalita_master_cambiata.emit(attiva)
	GameState.announce("🎩 Modalita' Master " + ("ATTIVA: il mouse muove tutti i token." if attiva else "disattivata: il mouse muove solo il party."))


## Hotseat: passa il mouse al prossimo giocatore del party. Ruota il PG attivo — scheda, inventario
## per-PG e barra XP seguono da soli via signal (nessuno stato duplicato qui).
func passa_posto() -> void:
	var membri: int = CharacterManager.get_party().size()
	if membri <= 1:
		return
	var prossimo: int = (CharacterManager.get_active_index() + 1) % membri
	CharacterManager.set_active_index(prossimo)
	var attivo: CharacterData = CharacterManager.get_active()
	if attivo:
		posto_cambiato.emit(prossimo, attivo.character_name)
		GameState.announce("🎮 Il mouse passa a %s." % attivo.character_name)


func _on_turn_changed(combatant_id: String, _round_number: int) -> void:
	# Sullo schermo condiviso il "tocca a te" va detto ad alta voce (in chat), non sottinteso.
	if combatant_id == CombatManager.PC_LOCAL_ID:
		var attivo: CharacterData = CharacterManager.get_active()
		if attivo:
			GameState.announce("⚔ Tocca a %s: a lui il mouse!" % attivo.character_name)
