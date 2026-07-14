class_name TokenArt
extends RefCounted
## Risolutore dell'ARTE dei token: dato il nome di un combattente ("Goblin 2", "Borin",
## "Scheletro 3") trova il PNG giusto, con questa priorita':
## 1. user://tokens/<id>.png — i render dell'utente (es. le miniature Blender di
##    tools/blender/genera_bestiario.py): FUORI dal progetto, sopravvivono agli aggiornamenti;
## 2. res://assets/tokens/<id>.png — i 14 token inclusi nel gioco (8 mostri + 6 classi);
## 3. null — chi disegna fa fallback al cerchio colorato di sempre (niente arte, zero crash).
##
## La normalizzazione butta i numeri finali ("Goblin 2" -> "goblin") e l'ALIAS traduce i nomi
## italiani del bestiario negli id file inglesi (scheletro -> skeleton). Cache statica: ogni
## texture si carica dal disco UNA volta per sessione, poi e' un lookup.

const CARTELLA_UTENTE: String = "user://tokens"
const CARTELLA_PROGETTO: String = "res://assets/tokens"
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


## Texture del token per un nome di combattente, o null se non c'e' arte per lui.
static func per_nome(nome: String) -> Texture2D:
	var chiave: String = _normalizza(nome)
	if chiave.is_empty():
		return null
	if _cache.has(chiave):
		return _cache[chiave]
	var tex: Texture2D = _cerca(String(ALIAS.get(chiave, chiave)))
	_cache[chiave] = tex  # anche i null: un file assente non va ricercato a ogni frame
	return tex


## Svuota la cache (es. dopo aver copiato nuovi PNG in user://tokens a gioco acceso).
static func azzera_cache() -> void:
	_cache.clear()


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


static func _cerca(id: String) -> Texture2D:
	if not _cartella_pronta:
		# user://tokens creata al primo uso: pronta da trovare quando l'utente copia i render.
		if not DirAccess.dir_exists_absolute(CARTELLA_UTENTE):
			DirAccess.make_dir_recursive_absolute(CARTELLA_UTENTE)
		_cartella_pronta = true
	var utente: String = CARTELLA_UTENTE.path_join(id + ".png")
	if FileAccess.file_exists(utente):
		var img: Image = Image.load_from_file(ProjectSettings.globalize_path(utente))
		if img != null:
			return ImageTexture.create_from_image(img)
	var progetto: String = CARTELLA_PROGETTO.path_join(id + ".png")
	if ResourceLoader.exists(progetto):
		var risorsa: Resource = load(progetto)
		if risorsa is Texture2D:
			return risorsa
	return null
