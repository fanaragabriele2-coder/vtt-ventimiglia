extends Node
## LocalInputManager (Autoload) — politica d'INPUT centralizzata del tavolo locale.
##
## C'e' UN solo mouse (o controller) condiviso da tutto il gruppo: questo manager decide che cosa
## quel puntatore puo' toccare, qualunque vista sia aperta (dungeon Nexus, mappa tattica...).
## Le viste CONSULTANO questa politica e non decidono da sole — un'unica regola, zero copie:
## - click su un token = tentativo di SELEZIONE (concessa solo se la politica lo permette);
## - click su una cella = ordine di movimento per il token selezionato (lo esegue la vista, lungo
##   un percorso A* reale: la politica non conosce la mappa, solo i permessi).
## In modalita' Master (LocalGameManager) si muove TUTTO; da giocatori, solo i token del party.

signal token_selezionato(token_id: String)
signal selezione_annullata()

const PREFISSO_PARTY: String = "nexus-pc"

var _selezionato: String = ""


func puo_muovere(token_id: String) -> bool:
	if LocalGameManager.is_modalita_master():
		return true
	return token_id.begins_with(PREFISSO_PARTY)


## Prova a selezionare un token: true se la politica lo concede (il chiamante evidenzia).
func seleziona(token_id: String) -> bool:
	if token_id.is_empty() or not puo_muovere(token_id):
		return false
	_selezionato = token_id
	token_selezionato.emit(token_id)
	return true


func deseleziona() -> void:
	if _selezionato.is_empty():
		return
	_selezionato = ""
	selezione_annullata.emit()


func selezionato() -> String:
	return _selezionato
