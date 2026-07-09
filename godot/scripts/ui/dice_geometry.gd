class_name DiceGeometry
extends RefCounted
## Geometria pura dei dadi poliedrici (la meta' matematica del Modulo 8 "3D Dice Engine").
##
## Costruisce i 6 solidi da tavolo — d4 tetraedro, d6 cubo, d8 ottaedro, d10 trapezoedro
## pentagonale (la "trottola" dei d10 veri), d12 dodecaedro, d20 icosaedro — come DATI puri:
## vertici a circumraggio ~1, facce (poligoni convessi avvolti in senso antiorario visti da
## fuori), normale e centro per faccia, e i VALORI stampati con la convenzione dei dadi veri:
## facce opposte che sommano a N+1 (7 sul d6, 21 sul d20...). Il d4 non ha facce opposte: 1-4.
##
## Nessun nodo, nessun engine: un'unica fonte di verita' condivisa da mesh, collisione e lettura
## del risultato (Dice3D) — impossibile che grafica e fisica divergano sulla stessa faccia.

const PHI: float = 1.618033988749895


## Ritorna { "vertici": PackedVector3Array, "facce": Array di PackedInt32Array,
## "normali": PackedVector3Array, "centri": PackedVector3Array, "valori": PackedInt32Array }.
## Dizionario vuoto se il numero di facce non corrisponde a un solido supportato.
static func costruisci(facce_dado: int) -> Dictionary:
	var vertici := PackedVector3Array()
	var poligoni: Array[PackedInt32Array] = []
	match facce_dado:
		4:
			vertici = _normalizzati([
				Vector3(1, 1, 1), Vector3(1, -1, -1), Vector3(-1, 1, -1), Vector3(-1, -1, 1),
			])
			poligoni = _facce_da_spigoli(vertici)
		6:
			vertici = _vertici_cubo()
			poligoni = _facce_attorno_a(vertici, _direzioni_assi(), 4)
		8:
			vertici = _normalizzati([
				Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 1, 0),
				Vector3(0, -1, 0), Vector3(0, 0, 1), Vector3(0, 0, -1),
			])
			poligoni = _facce_da_spigoli(vertici)
		10:
			var d10: Dictionary = _costruisci_d10()
			vertici = d10["vertici"]
			poligoni = d10["poligoni"]
		12:
			vertici = _vertici_dodecaedro()
			poligoni = _facce_attorno_a(vertici, _assi_facce_dodecaedro(), 5)
		20:
			vertici = _vertici_icosaedro()
			poligoni = _facce_da_spigoli(vertici)
		_:
			push_error("DiceGeometry: dado d%d non supportato" % facce_dado)
			return {}
	return _componi(vertici, poligoni, facce_dado)


# --- Vertici dei solidi platonici (tutti riscalati a circumraggio 1) ---

static func _vertici_cubo() -> PackedVector3Array:
	var lista: Array = []
	for x: int in [-1, 1]:
		for y: int in [-1, 1]:
			for z: int in [-1, 1]:
				lista.append(Vector3(x, y, z))
	return _normalizzati(lista)


static func _vertici_icosaedro() -> PackedVector3Array:
	var lista: Array = []
	for a: int in [-1, 1]:
		for b: int in [-1, 1]:
			# Permutazioni cicliche di (0, +-1, +-PHI).
			lista.append(Vector3(0, a, b * PHI))
			lista.append(Vector3(a, b * PHI, 0))
			lista.append(Vector3(a * PHI, 0, b))
	return _normalizzati(lista)


static func _vertici_dodecaedro() -> PackedVector3Array:
	var lista: Array = []
	for x: int in [-1, 1]:
		for y: int in [-1, 1]:
			for z: int in [-1, 1]:
				lista.append(Vector3(x, y, z))
	var inv: float = 1.0 / PHI
	for a: int in [-1, 1]:
		for b: int in [-1, 1]:
			# Permutazioni cicliche di (0, +-1/PHI, +-PHI).
			lista.append(Vector3(0, a * inv, b * PHI))
			lista.append(Vector3(a * inv, b * PHI, 0))
			lista.append(Vector3(a * PHI, 0, b * inv))
	return _normalizzati(lista)


## Gli assi delle 12 facce del dodecaedro STANDARD di cui sopra: i vertici del suo icosaedro
## duale nella chiralita' GIUSTA — permutazioni cicliche di (0, +-PHI, +-1), NON di (0, +-1,
## +-PHI): con quelle sbagliate i 5 vertici "piu' allineati" non sono una faccia (bug verificato
## a tavolino: i dot della cinquina corretta sono tutti uguali, ~0.7946, quelli sbagliati no).
static func _assi_facce_dodecaedro() -> PackedVector3Array:
	var lista: Array = []
	for a: int in [-1, 1]:
		for b: int in [-1, 1]:
			lista.append(Vector3(0, a * PHI, b))
			lista.append(Vector3(a * PHI, b, 0))
			lista.append(Vector3(a, 0, b * PHI))
	return _normalizzati(lista)


## Trapezoedro pentagonale con "aquiloni" PIANI: con gli apici a y=+-1 e l'anello equatoriale di
## raggio 1, la planarita' delle facce impone quota dell'anello = +-(1-cos36)/(1+cos36).
static func _costruisci_d10() -> Dictionary:
	var beta: float = cos(deg_to_rad(36.0))
	var quota: float = (1.0 - beta) / (1.0 + beta)
	var vertici := PackedVector3Array([Vector3(0, 1, 0), Vector3(0, -1, 0)])
	for k: int in range(5):
		var angolo_su: float = TAU * k / 5.0
		var angolo_giu: float = angolo_su + TAU / 10.0
		vertici.append(Vector3(cos(angolo_su), quota, sin(angolo_su)))      # indici 2,4,6,8,10
		vertici.append(Vector3(cos(angolo_giu), -quota, sin(angolo_giu)))   # indici 3,5,7,9,11
	var poligoni: Array[PackedInt32Array] = []
	for k: int in range(5):
		var su: int = 2 + 2 * k
		var giu: int = 3 + 2 * k
		var su_dopo: int = 2 + 2 * ((k + 1) % 5)
		var giu_dopo: int = 3 + 2 * ((k + 1) % 5)
		poligoni.append(_ordina_poligono(vertici, PackedInt32Array([0, su, giu, su_dopo])))
		poligoni.append(_ordina_poligono(vertici, PackedInt32Array([1, giu, su_dopo, giu_dopo])))
	return { "vertici": vertici, "poligoni": poligoni }


# --- Estrazione delle facce ---

## Per i solidi a facce TRIANGOLARI (d4, d8, d20): ogni terna di vertici mutuamente adiacenti
## (tutte le coppie a distanza = spigolo minimo) e' esattamente una faccia.
static func _facce_da_spigoli(vertici: PackedVector3Array) -> Array[PackedInt32Array]:
	var spigolo: float = INF
	for i: int in range(vertici.size()):
		for j: int in range(i + 1, vertici.size()):
			spigolo = minf(spigolo, vertici[i].distance_to(vertici[j]))
	var soglia: float = spigolo * 1.01
	var facce: Array[PackedInt32Array] = []
	for i: int in range(vertici.size()):
		for j: int in range(i + 1, vertici.size()):
			if vertici[i].distance_to(vertici[j]) > soglia:
				continue
			for k: int in range(j + 1, vertici.size()):
				if vertici[i].distance_to(vertici[k]) > soglia:
					continue
				if vertici[j].distance_to(vertici[k]) > soglia:
					continue
				facce.append(_ordina_poligono(vertici, PackedInt32Array([i, j, k])))
	return facce


## Per i solidi a facce POLIGONALI regolari (d6 quadrati, d12 pentagoni): per ogni direzione di
## faccia si prendono i `quanti` vertici piu' allineati e li si ordina attorno alla direzione.
## (Le direzioni delle facce del dodecaedro sono i vertici del suo duale, l'icosaedro.)
static func _facce_attorno_a(
	vertici: PackedVector3Array, direzioni: PackedVector3Array, quanti: int
) -> Array[PackedInt32Array]:
	var facce: Array[PackedInt32Array] = []
	for direzione: Vector3 in direzioni:
		var versore: Vector3 = direzione.normalized()
		var punteggi: Array = []
		for i: int in range(vertici.size()):
			punteggi.append([vertici[i].dot(versore), i])
		punteggi.sort()
		var scelti := PackedInt32Array()
		for n: int in range(quanti):
			scelti.append(int(punteggi[punteggi.size() - 1 - n][1]))
		facce.append(_ordina_poligono(vertici, scelti))
	return facce


## Ordina i vertici di un poligono convesso attorno al suo centro e garantisce l'avvolgimento
## antiorario visto da FUORI dal solido (normale uscente): e' la convenzione che mesh, collisione
## e lettura del risultato danno per scontata.
static func _ordina_poligono(
	vertici: PackedVector3Array, indici: PackedInt32Array
) -> PackedInt32Array:
	var centro: Vector3 = Vector3.ZERO
	for idx: int in indici:
		centro += vertici[idx]
	centro /= indici.size()
	var fuori: Vector3 = centro.normalized()
	var tangente: Vector3 = fuori.cross(Vector3.UP)
	if tangente.length_squared() < 0.001:
		tangente = fuori.cross(Vector3.RIGHT)
	tangente = tangente.normalized()
	var bitangente: Vector3 = fuori.cross(tangente)
	var angoli: Array = []
	for idx: int in indici:
		var raggio: Vector3 = vertici[idx] - centro
		angoli.append([atan2(raggio.dot(bitangente), raggio.dot(tangente)), idx])
	angoli.sort()
	var ordinati := PackedInt32Array()
	for coppia: Variant in angoli:
		ordinati.append(int(coppia[1]))
	var a: Vector3 = vertici[ordinati[0]]
	var b: Vector3 = vertici[ordinati[1]]
	var c: Vector3 = vertici[ordinati[2]]
	if (b - a).cross(c - a).dot(fuori) < 0.0:
		ordinati.reverse()
	return ordinati


# --- Composizione finale ---

static func _componi(
	vertici: PackedVector3Array, poligoni: Array[PackedInt32Array], facce_dado: int
) -> Dictionary:
	var normali := PackedVector3Array()
	var centri := PackedVector3Array()
	for poli: PackedInt32Array in poligoni:
		var centro: Vector3 = Vector3.ZERO
		for idx: int in poli:
			centro += vertici[idx]
		centro /= poli.size()
		centri.append(centro)
		var a: Vector3 = vertici[poli[0]]
		var b: Vector3 = vertici[poli[1]]
		var c: Vector3 = vertici[poli[2]]
		normali.append((b - a).cross(c - a).normalized())
	return {
		"vertici": vertici, "facce": poligoni, "normali": normali, "centri": centri,
		"valori": _assegna_valori(normali, facce_dado),
	}


## Come sui dadi veri: si accoppiano le facce opposte (normali anti-parallele) e si assegnano
## valori che sommano a N+1 — bilancia il baricentro "percepito" e si legge a colpo d'occhio.
static func _assegna_valori(normali: PackedVector3Array, facce_dado: int) -> PackedInt32Array:
	var totale: int = normali.size()
	var valori := PackedInt32Array()
	valori.resize(totale)
	if facce_dado == 4:
		for i: int in range(totale):
			valori[i] = i + 1
		return valori
	var assegnati: Dictionary = {}
	var prossimo: int = 1
	for i: int in range(totale):
		if assegnati.has(i):
			continue
		var opposta: int = -1
		var migliore: float = 2.0
		for j: int in range(i + 1, totale):
			if assegnati.has(j):
				continue
			var allineamento: float = normali[i].dot(normali[j])
			if allineamento < migliore:
				migliore = allineamento
				opposta = j
		valori[i] = prossimo
		valori[opposta] = totale + 1 - prossimo
		assegnati[i] = true
		assegnati[opposta] = true
		prossimo += 1
	return valori


static func _normalizzati(lista: Array) -> PackedVector3Array:
	var fuori := PackedVector3Array()
	for v: Vector3 in lista:
		fuori.append(v.normalized())
	return fuori


static func _direzioni_assi() -> PackedVector3Array:
	return PackedVector3Array([
		Vector3.RIGHT, Vector3.LEFT, Vector3.UP, Vector3.DOWN, Vector3.BACK, Vector3.FORWARD,
	])
