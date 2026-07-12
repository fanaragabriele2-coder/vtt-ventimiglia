# tools/blender — generatore di props per il VTT

`genera_props.py` è uno script da eseguire **dentro Blender** (4.x o 5.x): genera 8 props
stilizzati (albero, pino, cespuglio, roccia, botte, cassa, falò acceso, pozzo), li
renderizza **dall'alto** con camera ortografica e **sfondo trasparente**, e salva i PNG
512×512 in una cartella `vtt_props` sul Desktop.

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
