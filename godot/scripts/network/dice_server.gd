extends Node
## DiceServer (Autoload) — UI ASIMMETRICA del tavolo locale: i giocatori tirano i dadi dal PROPRIO
## telefono e il risultato compare in chat sullo schermo grande, che resta pulito e dedicato alla
## mappa. Un mini server HTTP su TCPServer, SOLO per la LAN di casa (nessuna autenticazione: e' il
## Wi-Fi del salotto, non internet — non esporlo su una rete pubblica).
##
## Il tiro e' AUTOREVOLE lato PC: il telefono chiede "tira un D20", e' il gioco a generare il
## numero — nessuna fiducia nel client, come si deve. Percorsi serviti:
##   GET /                     -> pagina web dei dadi (autosufficiente, inline)
##   GET /roll?die=20&name=X   -> tira, annuncia in chat, risponde {"die":20,"result":N}

signal server_stato_cambiato(attivo: bool)
signal tiro_ricevuto(nome: String, facce: int, risultato: int)

const PORTA: int = 8383
const TIMEOUT_RICHIESTA_SEC: float = 3.0

const PAGINA_HTML: String = """<!DOCTYPE html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dadi - Tavolo Oscuro</title>
<style>
body{background:#0b0a08;color:#e8dcc0;font-family:Georgia,serif;text-align:center;margin:0;padding:24px}
h1{color:#c89b3c;font-size:22px}
input{background:#1a1712;border:1px solid #6b5423;color:#e8dcc0;padding:10px;border-radius:8px;font-size:16px;width:80%;max-width:320px}
.dadi{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:18px}
button{background:linear-gradient(180deg,#3a2f16,#241c0c);border:1px solid #c89b3c;color:#f0d472;font-size:22px;padding:18px 22px;border-radius:12px;min-width:84px}
button:active{transform:scale(.96)}
#ris{font-size:64px;color:#f0d472;margin-top:20px;min-height:80px}
#det{color:#8a8378;font-size:14px}
</style></head><body>
<h1>&#9876; Tavolo Oscuro &mdash; Dadi</h1>
<input id="nome" placeholder="Il tuo nome" />
<div class="dadi">
<button onclick="tira(4)">D4</button><button onclick="tira(6)">D6</button>
<button onclick="tira(8)">D8</button><button onclick="tira(10)">D10</button>
<button onclick="tira(12)">D12</button><button onclick="tira(20)">D20</button>
</div>
<div id="ris">&ndash;</div><div id="det"></div>
<script>
var campo=document.getElementById("nome");
campo.value=localStorage.getItem("vtt-nome")||"";
function tira(n){
  var nome=campo.value.trim()||"Giocatore";
  localStorage.setItem("vtt-nome",nome);
  fetch("/roll?die="+n+"&name="+encodeURIComponent(nome))
    .then(function(r){return r.json();})
    .then(function(d){
      document.getElementById("ris").textContent=d.result;
      document.getElementById("det").textContent=nome+" ha tirato un D"+d.die+" (guarda lo schermo del tavolo)";
    })
    .catch(function(){document.getElementById("det").textContent="Errore di connessione al tavolo";});
}
</script></body></html>"""

var _server: TCPServer
var _pendenti: Array[Dictionary] = []   # { peer: StreamPeerTCP, buffer: String, eta: float }


func _ready() -> void:
	set_process(false)  # il server parte solo dal pulsante in toolbar


func e_attivo() -> bool:
	return _server != null


func avvia() -> bool:
	if _server != null:
		return true
	var s := TCPServer.new()
	var err: int = s.listen(PORTA)
	if err != OK:
		GameState.announce("⚠ Impossibile aprire il server dadi sulla porta %d (errore %d)." % [PORTA, err])
		return false
	_server = s
	set_process(true)
	var indirizzi: Array[String] = indirizzi_lan()
	var dove: String = ("http://%s:%d" % [indirizzi[0], PORTA]) if not indirizzi.is_empty() else ("http://IP-del-PC:%d" % PORTA)
	GameState.announce("📱 Dadi dai telefoni ATTIVI: sul telefono (stesso Wi-Fi) apri  " + dove)
	server_stato_cambiato.emit(true)
	return true


func ferma() -> void:
	if _server == null:
		return
	_server.stop()
	_server = null
	for p: Dictionary in _pendenti:
		(p["peer"] as StreamPeerTCP).disconnect_from_host()
	_pendenti.clear()
	set_process(false)
	GameState.announce("📱 Server dadi spento.")
	server_stato_cambiato.emit(false)


## Indirizzi IPv4 privati del PC (quelli da digitare sul telefono).
func indirizzi_lan() -> Array[String]:
	var out: Array[String] = []
	for addr: Variant in IP.get_local_addresses():
		var a: String = String(addr)
		if a.begins_with("192.168.") or a.begins_with("10.") or _e_172_privato(a):
			out.append(a)
	return out


static func _e_172_privato(a: String) -> bool:
	if not a.begins_with("172."):
		return false
	var secondo: int = int(a.get_slice(".", 1))
	return secondo >= 16 and secondo <= 31


func _process(delta: float) -> void:
	if _server == null:
		return
	while _server.is_connection_available():
		_pendenti.append({ "peer": _server.take_connection(), "buffer": "", "eta": 0.0 })
	var rimasti: Array[Dictionary] = []
	for p: Dictionary in _pendenti:
		var peer := p["peer"] as StreamPeerTCP
		peer.poll()
		var disponibili: int = peer.get_available_bytes()
		if disponibili > 0:
			p["buffer"] = String(p["buffer"]) + peer.get_utf8_string(disponibili)
		p["eta"] = float(p["eta"]) + delta
		var buffer: String = String(p["buffer"])
		if buffer.contains("\r\n\r\n") or buffer.contains("\n\n"):
			_gestisci_richiesta(peer, buffer)  # risponde e chiude
		elif float(p["eta"]) > TIMEOUT_RICHIESTA_SEC or peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			peer.disconnect_from_host()
		else:
			rimasti.append(p)
	_pendenti = rimasti


func _gestisci_richiesta(peer: StreamPeerTCP, richiesta: String) -> void:
	# Prima riga: "GET /roll?die=20&name=Luca HTTP/1.1"
	var prima_riga: String = richiesta.get_slice("\n", 0).strip_edges()
	var parti: PackedStringArray = prima_riga.split(" ")
	var percorso: String = parti[1] if parti.size() >= 2 else "/"
	if percorso == "/" or percorso.begins_with("/index"):
		_rispondi(peer, 200, "text/html; charset=utf-8", PAGINA_HTML)
	elif percorso.begins_with("/roll"):
		_gestisci_tiro(peer, percorso)
	else:
		_rispondi(peer, 404, "text/plain", "not found")


func _gestisci_tiro(peer: StreamPeerTCP, percorso: String) -> void:
	var facce: int = 20
	var nome: String = "Giocatore"
	for coppia: String in percorso.get_slice("?", 1).split("&"):
		var chiave: String = coppia.get_slice("=", 0)
		var valore: String = coppia.get_slice("=", 1).uri_decode().strip_edges()
		if chiave == "die":
			facce = clampi(int(valore), 2, 100)
		elif chiave == "name" and not valore.is_empty():
			nome = valore.substr(0, 24)
	var risultato: int = randi_range(1, facce)
	GameState.announce("📱 %s tira D%d: %d" % [nome, facce, risultato])
	tiro_ricevuto.emit(nome, facce, risultato)
	_rispondi(peer, 200, "application/json", JSON.stringify({ "die": facce, "result": risultato }))


func _rispondi(peer: StreamPeerTCP, codice: int, tipo: String, corpo: String) -> void:
	var stato: String = "200 OK" if codice == 200 else "404 Not Found"
	var corpo_bytes: PackedByteArray = corpo.to_utf8_buffer()
	var testa: String = "HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n" % [stato, tipo, corpo_bytes.size()]
	peer.put_data(testa.to_utf8_buffer())
	peer.put_data(corpo_bytes)
	peer.disconnect_from_host()
