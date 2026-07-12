# tools/blender — generatori di asset per il VTT

Due script da eseguire **dentro Blender** (4.x o 5.x):

- **`genera_props.py`** — 8 props di scena (albero, pino, cespuglio, roccia, botte, cassa,
  falò acceso, pozzo) → PNG 512×512 trasparenti in `Desktop/vtt_props`;
- **`genera_bestiario.py`** — le 14 MINIATURE del gioco: gli 8 mostri del bestiario
  (goblin, bandito, scheletro, lupo, orco, cultista, zombie, hobgoblin) e le 6 classi eroi
  (guerriero, barbaro, ladro, ranger, mago, chierico), ognuna modellata in 3D su basetta
  colore-fazione (rossa nemici, oro eroi) → PNG 512×512 trasparenti in `Desktop/vtt_tokens`.

**Le miniature entrano nel gioco da sole**: copia i PNG di `vtt_tokens` nella cartella
`user://tokens` del gioco (è accanto a `user://maps`: dal gioco premi "📁 Apri cartella
mappe", risali di una cartella ed entra in `tokens`). I nomi file coincidono con gli id del
gioco, quindi mappa tattica e Mondo cucito li usano subito al posto dei token inclusi —
e `user://` sopravvive a ogni aggiornamento del gioco.

## Come eseguirlo

### Strada A — con Claude Desktop + Blender MCP (consigliata se hai il collegamento attivo)
1. Apri Blender (con il server MCP avviato dal pannello N → BlenderMCP → Connect);
2. apri Claude Desktop e scrivi:
   > Esegui in Blender questo script Python, così com'è: *(incolla tutto il contenuto di
   > `genera_props.py`)*
3. attendi i render (Cycles, ~10-60 s per prop a seconda del PC);
4. i PNG compaiono in `Desktop/vtt_props/`.

### Strada B — a mano, senza MCP
1. Apri Blender → tab **Scripting** → **Open** → seleziona `genera_props.py`;
2. premi **Run Script** (Alt+P);
3. i PNG compaiono in `Desktop/vtt_props/`.

## A cosa servono i props

- **Adesso**: decora le battlemap con qualunque editor di immagini (GIMP, Krita, Photopea):
  apri la mappa, incolla i props dove vuoi, esporta, e trascina il risultato sulla finestra
  del gioco (vista 🧩 Mondo cucito).
- **Fase C della ROADMAP**: layer di props posizionabili DENTRO il gioco (snap alla griglia,
  rotazione, salvataggio in `user://`) — questi PNG saranno la dotazione di partenza,
  affiancabili agli asset di Forgotten Adventures scaricati da te.

## Personalizzare

Lo script è pensato per essere modificato: ogni prop è una funzione `prop_*()` di poche
righe (primitive + materiali). Aggiungi una funzione, registrala nel dizionario `PROPS`,
rilancia. Con Claude Desktop collegato a Blender MCP puoi anche chiedere direttamente:
"aggiungi allo script un carro con le ruote e rigenera i props".

Tutto ciò che generi con questo script è tuo, senza vincoli di licenza.
