class_name WorldRoute
extends Node2D
## Traccia visiva del viaggio a dadi sul Mondo cucito: una linea dalla partenza alla meta (piena
## per il tratto gia' percorso, tratteggiata per quello che resta), un pennino sul punto raggiunto
## e una bandierina sulla destinazione. Aggiornata da WorldBuilder sugli eventi di TravelDirector;
## invisibile quando non c'e' un viaggio in corso.

const COL_FATTO: Color = Color(0.90, 0.76, 0.36, 0.95)
const COL_RESTO: Color = Color(0.90, 0.76, 0.36, 0.32)
const COL_BORDO: Color = Color(0.10, 0.08, 0.06, 0.85)
const COL_META: Color = Color(0.82, 0.30, 0.26)
const COL_PENNINO: Color = Color(0.98, 0.88, 0.52)

var _da: Vector2 = Vector2.ZERO
var _a: Vector2 = Vector2.ZERO
var _progresso: Vector2 = Vector2.ZERO
var _attiva: bool = false


## Imposta la rotta di un nuovo viaggio (progresso azzerato sulla partenza).
func imposta_rotta(da: Vector2, a: Vector2) -> void:
	_da = da
	_a = a
	_progresso = da
	_attiva = true
	queue_redraw()


## Aggiorna il punto raggiunto dopo una tappa.
func imposta_progresso(punto: Vector2) -> void:
	_progresso = punto
	queue_redraw()


func pulisci() -> void:
	_attiva = false
	queue_redraw()


func _draw() -> void:
	if not _attiva:
		return
	# Tratto percorso (pieno) e tratto restante (tratteggiato leggero).
	if _da.distance_to(_progresso) > 1.0:
		draw_line(_da, _progresso, COL_FATTO, 5.0, true)
	_tratteggia(_progresso, _a, COL_RESTO, 4.0, 28.0)
	# Bandierina sulla meta.
	draw_circle(_a, 16.0, COL_BORDO)
	draw_circle(_a, 12.0, COL_META)
	# Pennino di progresso.
	draw_circle(_progresso, 10.0, COL_BORDO)
	draw_circle(_progresso, 7.0, COL_PENNINO)


## Linea tratteggiata da `da` ad `a`: segmenti pieni lunghi ~55% del passo, separati da un vuoto.
func _tratteggia(da: Vector2, a: Vector2, colore: Color, spessore: float, passo: float) -> void:
	var lung: float = da.distance_to(a)
	if lung <= 1.0:
		return
	var dir: Vector2 = (a - da) / lung
	var t: float = 0.0
	while t < lung:
		var t2: float = minf(t + passo * 0.55, lung)
		draw_line(da + dir * t, da + dir * t2, colore, spessore, true)
		t += passo
