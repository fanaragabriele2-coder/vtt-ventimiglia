extends Node
## GameState (Autoload singleton) — porting del Modulo 36 JS "Global Game State".
##
## Nel monolite era un piccolo store osservabile (get/set/subscribe + event bus): l'UNICA copia di
## verita' condivisa, cosi' Chat, Inventario e Mappe non tenevano stato divergente in variabili
## indipendenti (regola di traduzione 1: subscribe -> Signals).
##
## In Godot il paradigma idiomatico e' proprio questo: un Autoload che espone lo stato globale e
## NOTIFICA via `signal`. I sistemi (mappa tattica, overworld, HUD) si connettono ai signal e
## restano disaccoppiati — non si conoscono tra loro, comunicano solo attraverso di me.
##
## Registrazione: Project > Project Settings > Autoload -> aggiungi come "GameState".

## Un cambiamento qualunque nello store (chiave, nuovo valore, valore precedente).
signal state_changed(key: String, value: Variant, previous: Variant)
## La posizione del party sulla overworld e' cambiata ({ "name": String, "lat": float, "lng": float }).
signal party_location_changed(location: Dictionary)
## L'Encounter Balancer ha pubblicato un nuovo scontro bilanciato ({ "cr", "budget", "lista" }).
signal encounter_balanced(encounter: Dictionary)
## Lo stato di combattimento globale e' cambiato.
signal combat_active_changed(active: bool)
## Bus generico per notifiche che non sono un semplice cambio-chiave (es. "party:moved").
signal event_published(event_name: String, payload: Variant)

const KEY_PARTY_LOCATION: String = "party.location"
const KEY_LAST_ENCOUNTER: String = "encounter.last"
const KEY_COMBAT_ACTIVE: String = "combat.active"

# Stato canonico a namespace: chiavi tipo "party.location" cosi' sistemi diversi non si pestano.
var _state: Dictionary = {
	KEY_PARTY_LOCATION: null,
	KEY_LAST_ENCOUNTER: null,
	KEY_COMBAT_ACTIVE: false,
}


## Lettura di una chiave (null se assente).
func get_value(key: String) -> Variant:
	return _state.get(key)


## Snapshot copiato dell'intero stato (come get() senza argomenti nel JS).
func get_snapshot() -> Dictionary:
	return _state.duplicate(true)


## Scrive e notifica SOLO se il valore e' davvero cambiato (evita loop tra sistemi che si
## riascoltano). Emette il signal generico state_changed + quello tipizzato della chiave.
func set_value(key: String, value: Variant) -> bool:
	var previous: Variant = _state.get(key)
	if previous == value:
		return false
	_state[key] = value
	state_changed.emit(key, value, previous)
	_emit_typed_signal(key, value)
	return true


func _emit_typed_signal(key: String, value: Variant) -> void:
	match key:
		KEY_PARTY_LOCATION:
			party_location_changed.emit(value if value is Dictionary else {})
		KEY_LAST_ENCOUNTER:
			encounter_balanced.emit(value if value is Dictionary else {})
		KEY_COMBAT_ACTIVE:
			combat_active_changed.emit(bool(value))


## Bus generico: notifiche libere non legate a una chiave (equivalente di publish() nel JS).
func publish(event_name: String, payload: Variant = null) -> void:
	event_published.emit(event_name, payload)


# --- Setter tipizzati di comodo (i sistemi preferiscono questi alle stringhe) ---

func set_combat_active(active: bool) -> void:
	set_value(KEY_COMBAT_ACTIVE, active)


func is_combat_active() -> bool:
	return bool(_state.get(KEY_COMBAT_ACTIVE, false))


func set_party_location(location: Dictionary) -> void:
	set_value(KEY_PARTY_LOCATION, location)


func get_party_location() -> Variant:
	return _state.get(KEY_PARTY_LOCATION)


func set_last_encounter(encounter: Dictionary) -> void:
	set_value(KEY_LAST_ENCOUNTER, encounter)
	publish("encounter:balanced", encounter)


## Azzera lo store (utile per i test o un "nuovo gioco").
func reset() -> void:
	_state = {
		KEY_PARTY_LOCATION: null,
		KEY_LAST_ENCOUNTER: null,
		KEY_COMBAT_ACTIVE: false,
	}
