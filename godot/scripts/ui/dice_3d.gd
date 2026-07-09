class_name Dice3D
extends RigidBody3D
## Un dado poliedrico FISICO (la meta' engine del Modulo 8 "3D Dice Engine"): mesh flat-shaded,
## collisione convessa e numeri Label3D costruiti TUTTI dagli stessi dati di DiceGeometry — cio'
## che vedi e' esattamente cio' che rotola. Il risultato non e' un randi() travestito: si lancia
## il corpo rigido e, a riposo, vince la faccia con la normale piu' vicina alla verticale.
## Il d4, come quelli veri "a piramide", si legge dalla faccia appoggiata al tavolo: ogni faccia
## porta 3 numeri (uno per angolo) e a riposo i tre attorno alla punta mostrano il risultato.

## [colore del corpo, colore dei numeri] per tipo di dado — la palette del tavolo.
const ASPETTO: Dictionary = {
	4: [Color(0.72, 0.28, 0.22), Color(0.96, 0.92, 0.84)],
	6: [Color(0.91, 0.87, 0.77), Color(0.16, 0.13, 0.10)],
	8: [Color(0.22, 0.34, 0.55), Color(0.95, 0.94, 0.90)],
	10: [Color(0.24, 0.45, 0.32), Color(0.95, 0.94, 0.88)],
	12: [Color(0.42, 0.26, 0.52), Color(0.96, 0.93, 0.88)],
	20: [Color(0.55, 0.13, 0.13), Color(0.94, 0.83, 0.53)],
}

var facce: int = 20
var _dati: Dictionary = {}


## Da chiamare PRIMA di aggiungere il nodo alla scena: costruisce mesh, collisione, numeri e
## parametri fisici per il dado richiesto. `dimensione` e' il circumraggio in unita' del mondo.
func configura(nuove_facce: int, dimensione: float = 0.52) -> void:
	facce = nuove_facce
	_dati = DiceGeometry.costruisci(facce)
	if _dati.is_empty():
		return
	var stile: Array = ASPETTO.get(facce, ASPETTO[20])
	_costruisci_mesh(dimensione, stile[0])
	_costruisci_collisione(dimensione)
	if facce == 4:
		_applica_numeri_d4(dimensione, stile[1])
	else:
		_applica_numeri(dimensione, stile[1])
	_configura_fisica()


## Scaglia il dado nel vassoio: posizione di partenza, spinta, e una rotazione iniziale + velocita'
## angolare casuali (e' il tumbling vero a decidere il risultato, non un numero pescato).
func lancia(da: Vector3, spinta: Vector3) -> void:
	global_position = da
	basis = Basis.from_euler(Vector3(randf() * TAU, randf() * TAU, randf() * TAU))
	linear_velocity = spinta
	angular_velocity = Vector3(
		randf_range(-16.0, 16.0), randf_range(-16.0, 16.0), randf_range(-16.0, 16.0)
	)


func e_fermo() -> bool:
	if sleeping:
		return true
	return linear_velocity.length_squared() < 0.001 and angular_velocity.length_squared() < 0.01


## Legge il risultato dalla POSA fisica attuale: la faccia con la normale piu' vicina al cielo
## (per il d4: alla terra — si legge la faccia d'appoggio, come sui d4 veri).
func risultato() -> int:
	if _dati.is_empty():
		return 1
	var normali: PackedVector3Array = _dati["normali"]
	var valori: PackedInt32Array = _dati["valori"]
	var cerca_sotto: bool = facce == 4
	var migliore: float = -2.0
	var vincente: int = 0
	for f: int in range(normali.size()):
		var verso: Vector3 = (global_transform.basis * normali[f]).normalized()
		var quota: float = -verso.y if cerca_sotto else verso.y
		if quota > migliore:
			migliore = quota
			vincente = f
	return valori[vincente]


# --- Costruzione ---

func _costruisci_mesh(dimensione: float, colore: Color) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var vertici: PackedVector3Array = _dati["vertici"]
	var normali: PackedVector3Array = _dati["normali"]
	var poligoni: Array = _dati["facce"]
	for f: int in range(poligoni.size()):
		var poli: PackedInt32Array = poligoni[f]
		st.set_normal(normali[f])  # normale PER FACCIA: spigoli netti, look "dado inciso"
		for t: int in range(1, poli.size() - 1):
			st.add_vertex(vertici[poli[0]] * dimensione)
			st.add_vertex(vertici[poli[t]] * dimensione)
			st.add_vertex(vertici[poli[t + 1]] * dimensione)
	var materiale := StandardMaterial3D.new()
	materiale.albedo_color = colore
	materiale.roughness = 0.35
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	mesh.material_override = materiale
	add_child(mesh)


func _costruisci_collisione(dimensione: float) -> void:
	var punti := PackedVector3Array()
	for v: Vector3 in (_dati["vertici"] as PackedVector3Array):
		punti.append(v * dimensione)
	var forma := ConvexPolygonShape3D.new()
	forma.points = punti
	var collisione := CollisionShape3D.new()
	collisione.shape = forma
	add_child(collisione)


func _applica_numeri(dimensione: float, inchiostro: Color) -> void:
	var centri: PackedVector3Array = _dati["centri"]
	var normali: PackedVector3Array = _dati["normali"]
	var valori: PackedInt32Array = _dati["valori"]
	for f: int in range(centri.size()):
		var testo: String = str(valori[f])
		# 6 e 9 si confondono a dado fermo: il punto li disambigua (come sui d20 veri).
		if valori[f] == 6 or valori[f] == 9:
			testo += "."
		var posizione: Vector3 = (centri[f] + normali[f] * 0.02) * dimensione
		add_child(_etichetta(testo, posizione, normali[f], _raggio_faccia(f) * dimensione, inchiostro))


## Sui d4 veri il risultato si legge al VERTICE in alto: ogni faccia porta 3 numeri, uno per
## angolo, e ogni angolo mostra il valore della faccia OPPOSTA a quel vertice (quella a terra
## quando quel vertice e' in cima). A riposo, i tre numeri attorno alla punta coincidono.
func _applica_numeri_d4(dimensione: float, inchiostro: Color) -> void:
	var vertici: PackedVector3Array = _dati["vertici"]
	var poligoni: Array = _dati["facce"]
	var centri: PackedVector3Array = _dati["centri"]
	var normali: PackedVector3Array = _dati["normali"]
	var valori: PackedInt32Array = _dati["valori"]
	for f: int in range(poligoni.size()):
		var poli: PackedInt32Array = poligoni[f]
		for idx: int in poli:
			var valore: int = valori[_faccia_senza_vertice(idx)]
			var punto: Vector3 = centri[f] + (vertici[idx] - centri[f]) * 0.55
			var posizione: Vector3 = (punto + normali[f] * 0.02) * dimensione
			var alto: float = _raggio_faccia(f) * dimensione * 0.55
			add_child(_etichetta(str(valore), posizione, normali[f], alto, inchiostro))


## L'unica faccia del tetraedro che NON contiene il vertice dato (la sua "opposta").
func _faccia_senza_vertice(indice_vertice: int) -> int:
	var poligoni: Array = _dati["facce"]
	for f: int in range(poligoni.size()):
		if not (indice_vertice in (poligoni[f] as PackedInt32Array)):
			return f
	return 0


func _etichetta(
	testo: String, posizione: Vector3, normale: Vector3, altezza: float, inchiostro: Color
) -> Label3D:
	var label := Label3D.new()
	label.text = testo
	label.font_size = 96
	label.modulate = inchiostro
	label.pixel_size = altezza / 96.0
	label.position = posizione
	label.basis = _base_faccia(normale)
	return label


## Raggio inscritto approssimato della faccia (distanza centro -> spigolo piu' vicino), usato per
## dimensionare i numeri in modo che riempiano la faccia senza sbordare — su OGNI solido.
func _raggio_faccia(f: int) -> float:
	var vertici: PackedVector3Array = _dati["vertici"]
	var poli: PackedInt32Array = _dati["facce"][f]
	var centro: Vector3 = _dati["centri"][f]
	var raggio: float = INF
	for i: int in range(poli.size()):
		var a: Vector3 = vertici[poli[i]]
		var b: Vector3 = vertici[poli[(i + 1) % poli.size()]]
		raggio = minf(raggio, _distanza_da_segmento(centro, a, b))
	return raggio * 1.05


func _distanza_da_segmento(punto: Vector3, a: Vector3, b: Vector3) -> float:
	var ab: Vector3 = b - a
	var t: float = clampf((punto - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
	return punto.distance_to(a + ab * t)


## Base ortonormale con +Z lungo la normale della faccia (il fronte leggibile di Label3D e' +Z).
func _base_faccia(normale: Vector3) -> Basis:
	var aiuto: Vector3 = Vector3.UP if absf(normale.y) < 0.9 else Vector3.RIGHT
	var x: Vector3 = aiuto.cross(normale).normalized()
	var y: Vector3 = normale.cross(x)
	return Basis(x, y, normale)


func _configura_fisica() -> void:
	var materiale := PhysicsMaterial.new()
	materiale.bounce = 0.28
	materiale.friction = 0.65
	physics_material_override = materiale
	# Gravita' rinforzata: i dadi sono "grandi" ~mezzo metro per la camera, ma devono cadere e
	# fermarsi col ritmo secco di un dado vero sul feltro, non fluttuare come casse.
	gravity_scale = 3.0
	continuous_cd = true
	linear_damp = 0.1
	angular_damp = 0.35
	can_sleep = true
