class_name TokenArt
extends RefCounted
## Risolutore dell'ARTE dei token: dato il nome di un combattente ("Goblin 2", "Borin",
## "Scheletro 3") trova il PNG giusto, con questa priorita':
## 1. user://tokens/<id>.png — i file dell'utente col nome ESATTO: FUORI dal progetto,
##    sopravvivono agli aggiornamenti e vincono su tutto;
## 2. user://tokens/<qualunque nome>.png — match FUZZY: un file il cui nome contiene il nome
##    del mostro ("Goblin di Moria - Guerriero CR 1-4.png" aggancia Goblin di Moria) — cosi'
##    una libreria di ritratti si importa SENZA rinominare nulla; a parita' vince il nome
##    file piu' corto (il meno "decorato"), accenti ridotti (Khamûl == khamul);
## 3. res://assets/tokens/<id>.png — i token inclusi nel gioco (distintivi segnaposto);
## 4. null — chi disegna fa fallback al cerchio colorato di sempre (niente arte, zero crash).
##
## La normalizzazione butta i numeri finali ("Goblin 2" -> "goblin") e l'ALIAS traduce i nomi
## del bestiario negli id file (scheletro -> skeleton). Cache statica: ogni texture si carica
## dal disco UNA volta per sessione, poi e' un lookup (azzera_cache dopo nuovi import).

const CARTELLA_UTENTE: String = "user://tokens"
const CARTELLA_PROGETTO: String = "res://assets/tokens"
## Parole senza significato per il match fuzzy (articoli/preposizioni dei nomi italiani).
const STOPWORD_FUZZY: Array[String] = [
	"di", "del", "della", "dello", "dei", "degli", "delle", "da", "dal",
	"il", "lo", "la", "le", "un", "uno", "una", "nell", "nella", "nello",
]
const ALIAS: Dictionary = {
	"goblin": "goblin", "bandito": "bandit", "scheletro": "skeleton", "lupo": "wolf",
	"orco": "orc", "cultista": "cultist", "zombie": "zombie", "hobgoblin": "hobgoblin",
	"guerriero": "guerriero", "barbaro": "barbaro", "ladro": "ladro",
	"ranger": "ranger", "mago": "mago", "chierico": "chierico",
	# Bestiario Terra di Mezzo (i nomi normalizzati non coincidono coi file: "Goblin di Moria"
	# -> "goblin-moria.png"). Uruk-hai/Shelob non servono alias: nome normalizzato == file.
	"goblin di moria": "goblin-moria",
	"uomo selvaggio di dunland": "uomo-selvaggio",
	"orco di isengard": "orco-isengard",
	"corsaro di umbar": "corsaro-umbar",
	"arciere haradrim": "arciere-haradrim",
	"capitano uruk-hai": "capitano-uruk-hai",
	"spettro della palude": "spettro-palude",
	"troll delle caverne": "troll-caverne",
	"grima vermilinguo": "grima-vermilinguo",
	"guardiano nell'acqua": "guardiano-acqua",
	"khamûl lo stregone orientale": "nazgul-khamul",
	"akhorahil": "nazgul-akhorahil",
	"ren lo sconvolto": "nazgul-ren",
	"adûnaphel la silente": "nazgul-adunaphel",
	"uvatha il cavaliere": "nazgul-uvatha",
	"hoarmurath di dir": "nazgul-hoarmurath",
	"dwar di waw": "nazgul-dwar",
	"ji indur sventamorte": "nazgul-ji-indur",
	"saruman il bianco": "saruman-bianco",
	"la bocca di sauron": "bocca-di-sauron",
	"il re stregone di angmar": "re-stregoni-angmar",
	"drago delle montagne grigie": "drago-montagne-grigie",
	"balrog di morgoth": "balrog",
}

static var _cache: Dictionary = {}
static var _cartella_pronta: bool = false
# Elenco dei file in user://tokens (per il match fuzzy), letto UNA volta per sessione.
static var _file_utente: PackedStringArray = PackedStringArray()
static var _file_utente_letti: bool = false


## Texture del token per un nome di combattente, o null se non c'e' arte per lui.
static func per_nome(nome: String) -> Texture2D:
	var chiave: String = _normalizza(nome)
	if chiave.is_empty():
		return null
	if _cache.has(chiave):
		return _cache[chiave]
	var id: String = String(ALIAS.get(chiave, chiave))
	# Il fuzzy sui file dell'utente passa PRIMA del segnaposto incluso: i ritratti veri
	# (comunque siano chiamati) devono vincere sui distintivi con la lettera.
	var tex: Texture2D = _carica_utente_esatto(id)
	if tex == null:
		tex = _cerca_fuzzy_utente(chiave, id)
	if tex == null:
		tex = _carica_inclusa(id)
	_cache[chiave] = tex  # anche i null: un file assente non va ricercato a ogni frame
	return tex


## Svuota la cache (es. dopo aver copiato nuovi PNG in user://tokens a gioco acceso).
static func azzera_cache() -> void:
	_cache.clear()
	_file_utente_letti = false


## "Goblin 2" -> "goblin"; "  Mago " -> "mago". Toglie SOLO spazi e cifre in coda.
static func _normalizza(nome: String) -> String:
	var s: String = nome.to_lower().strip_edges()
	while s.length() > 0:
		var ultimo: String = s[s.length() - 1]
		if ultimo == " " or (ultimo >= "0" and ultimo <= "9"):
			s = s.left(s.length() - 1)
		else:
			break
	return s


## Il file dell'utente col nome ESATTO <id>.png (priorita' massima).
static func _carica_utente_esatto(id: String) -> Texture2D:
	_assicura_cartella()
	return _carica_file_utente(id + ".png")


## Il token incluso nel progetto (segnaposto), <id>.png in assets/tokens.
static func _carica_inclusa(id: String) -> Texture2D:
	var progetto: String = CARTELLA_PROGETTO.path_join(id + ".png")
	if ResourceLoader.exists(progetto):
		var risorsa: Resource = load(progetto)
		if risorsa is Texture2D:
			return risorsa
	return null


## MATCH FUZZY sui file dell'utente, per PAROLE: un file combacia se OGNI parola significativa
## del nome del mostro trova una parola del nome file con la stessa radice (prime 6 lettere:
## "corsaro" aggancia "Corsari", "troll" aggancia "Trolls"; le parole corte richiedono
## uguaglianza esatta, "ren" non scatta dentro "warden"). Prima si prova col NOME ("goblin di
## moria"), poi con l'ID ("nazgul-ren" ripesca i Nazgul citati per soprannome). A parita' vince
## il nome file piu' CORTO (il meno "decorato").
static func _cerca_fuzzy_utente(chiave: String, id: String) -> Texture2D:
	for tentativo: String in [chiave, id]:
		var parole: PackedStringArray = _parole_chiave(tentativo)
		if parole.is_empty():
			continue
		var migliore: String = ""
		for nome_file: String in _lista_file_utente():
			var parole_file: PackedStringArray = _norm_fuzzy(nome_file.get_basename()).split(" ")
			if _tutte_presenti(parole, parole_file) \
					and (migliore.is_empty() or nome_file.length() < migliore.length()):
				migliore = nome_file
		if not migliore.is_empty():
			return _carica_file_utente(migliore)
	return null


static func _parole_chiave(testo: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for p: String in _norm_fuzzy(testo).split(" "):
		if not p.is_empty() and not STOPWORD_FUZZY.has(p):
			out.append(p)
	return out


static func _tutte_presenti(parole: PackedStringArray, parole_file: PackedStringArray) -> bool:
	for p: String in parole:
		var trovata: bool = false
		for f: String in parole_file:
			if _parola_combacia(p, f):
				trovata = true
				break
		if not trovata:
			return false
	return true


## Parole corte (<4): uguaglianza esatta. Parole lunghe: stessa RADICE — il confronto e' sul
## prefisso lungo quanto la piu' corta delle due (max 6): cosi' singolari/plurali e suffissi
## combaciano ("stregone"/"Stregoni", "troll"/"Trolls", "caverne"/"Cavernone") ma "Moria" non
## scatta dentro "Mordor" (prefisso a 5: "moria" != "mordo").
static func _parola_combacia(chiave_p: String, file_p: String) -> bool:
	if chiave_p.length() < 4 or file_p.length() < 4:
		return chiave_p == file_p
	var n: int = mini(6, mini(chiave_p.length(), file_p.length()))
	return chiave_p.left(n) == file_p.left(n)


## Normalizzazione per il fuzzy: minuscolo, accenti ridotti, tutto cio' che non e' lettera o
## cifra diventa spazio singolo ("Khamûl_lo-Stregone (CR4)" -> "khamul lo stregone cr4").
static func _norm_fuzzy(testo: String) -> String:
	var s: String = testo.to_lower()
	var accenti: Dictionary = {
		"à": "a", "á": "a", "â": "a", "è": "e", "é": "e", "ê": "e", "ì": "i", "í": "i",
		"î": "i", "ò": "o", "ó": "o", "ô": "o", "ù": "u", "ú": "u", "û": "u",
	}
	for k: String in accenti:
		s = s.replace(k, accenti[k])
	var pulito: String = ""
	for i: int in range(s.length()):
		var ch: String = s[i]
		pulito += ch if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") else " "
	while pulito.contains("  "):
		pulito = pulito.replace("  ", " ")
	return pulito.strip_edges()


static func _lista_file_utente() -> PackedStringArray:
	if _file_utente_letti:
		return _file_utente
	_file_utente_letti = true
	_file_utente = PackedStringArray()
	_assicura_cartella()
	var dir: DirAccess = DirAccess.open(CARTELLA_UTENTE)
	if dir != null:
		for nome_file: String in dir.get_files():
			var est: String = nome_file.get_extension().to_lower()
			if est == "png" or est == "jpg" or est == "jpeg" or est == "webp":
				_file_utente.append(nome_file)
	return _file_utente


static func _carica_file_utente(nome_file: String) -> Texture2D:
	var percorso: String = CARTELLA_UTENTE.path_join(nome_file)
	if not FileAccess.file_exists(percorso):
		return null
	var img: Image = Image.load_from_file(ProjectSettings.globalize_path(percorso))
	return ImageTexture.create_from_image(img) if img != null else null


static func _assicura_cartella() -> void:
	if not _cartella_pronta:
		# user://tokens creata al primo uso: pronta da trovare quando l'utente copia i ritratti.
		if not DirAccess.dir_exists_absolute(CARTELLA_UTENTE):
			DirAccess.make_dir_recursive_absolute(CARTELLA_UTENTE)
		_cartella_pronta = true
