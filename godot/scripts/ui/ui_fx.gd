class_name UiFx
extends RefCounted
## Micro-transizioni dei PANNELLI: un'apertura non e' piu' un "on/off" secco ma una comparsa che
## SCIVOLA e sfuma. Una riga sola dove serve — `UiFx.entra(pannello)` — cosi' bottega, missioni,
## diario e viaggio si aprono con lo stesso respiro, senza duplicare codice di tween in ognuno.
##
## Va chiamato quando il Control e' GIA' visibile e nell'albero (tipico: in fondo ad `apri()` o
## nell'hook `visibility_changed`). Riporta sempre modulate/posizione al valore pieno a fine corsa,
## quindi e' sicuro richiamarlo a ogni apertura.

const SCIVOLO_PX: float = 26.0
const DURATA: float = 0.26


## Entrata SCIVOLATA + dissolvenza. `dal_basso`=true entra salendo (default), false scende.
static func entra(control: Control, dal_basso: bool = true) -> void:
	if control == null or not control.is_inside_tree():
		return
	var arrivo: Vector2 = control.position
	var dy: float = SCIVOLO_PX if dal_basso else -SCIVOLO_PX
	control.position = arrivo + Vector2(0.0, dy)
	control.modulate = Color(control.modulate, 0.0)
	var tw: Tween = control.create_tween().set_parallel(true)
	tw.tween_property(control, "modulate:a", 1.0, DURATA)
	tw.tween_property(control, "position", arrivo, DURATA + 0.04) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
