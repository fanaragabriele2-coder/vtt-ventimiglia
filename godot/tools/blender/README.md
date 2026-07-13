# tools/blender — generatori di asset per il VTT

Tre script da eseguire **dentro Blender** (4.x o 5.x):

- **`genera_castello.py`** — la **ROCCA DEL CONFINE**: castello dungeon 3D completo,
  renderizzato dall'alto in DUE battlemap pronte per il VTT (`Desktop/vtt_castello/`):
  - *castello_superficie.png*: mura spesse col camminamento, 4 torri con stendardi
    strappati, corpo di guardia col ponte sul fossato, breccia di battaglia, cortile con
    pozzo e bracieri, caserma, armeria e il mastio con la **sala del trono** — tutto senza
    tetti: gli interni si leggono dall'alto;
  - *castello_sotterraneo.png*: il dungeon — blocco prigione con celle sbarrate, corpo di
    guardia, catacombe coi sarcofagi, **camera rituale col cerchio runico**, un crollo che
    blocca un passaggio. Le **due scale** (cortile e retro-trono) sono negli STESSI
    quadretti su entrambe le mappe: salire e scendere è coerente.
  - Scala VTT: 1 cella = 1,5 m, inquadratura 64×64 celle, 48 px/cella a 3072 px.
    Leggibilità prima del dettaglio: corridoi mai sotto le 2 celle, stanze rettangolari,
    porte evidenti. In gioco: trascina i PNG sulla finestra (vista 🧩 Mondo cucito) o
    usali come sfondo della mappa tattica.

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

## Asset gratuiti Poly Haven (CC0) dentro Blender — per il castello e non solo

L'addon **Blender MCP ha l'integrazione Poly Haven incorporata**: nel pannello N →
BlenderMCP spunta **"Use assets from Poly Haven"**. Da quel momento puoi chiedere a
Claude Desktop, ad esempio:

> Cerca su Poly Haven una texture di pietra medievale consumata e applicala alle mura
> del castello; poi un HDRI notturno per l'illuminazione.

Claude Desktop scarica gli asset **CC0** (liberi anche per uso commerciale, nessuna
attribuzione dovuta) e li applica direttamente nella scena — molto meglio dei materiali
procedurali dello script, quando servono. Consigli per il castello: texture
`stone_wall`/`castle_brick` per le mura, `wood_planks` scuro per ponte e porte,
`cobblestone` per il cortile, un HDRI `night`/`moonlit` per l'atmosfera. Dopo aver
applicato le texture, rilancia solo i due render (le ultime righe dello script).

## Personalizzare

Lo script è pensato per essere modificato: ogni prop è una funzione `prop_*()` di poche
righe (primitive + materiali). Aggiungi una funzione, registrala nel dizionario `PROPS`,
rilancia. Con Claude Desktop collegato a Blender MCP puoi anche chiedere direttamente:
"aggiungi allo script un carro con le ruote e rigenera i props".

Tutto ciò che generi con questo script è tuo, senza vincoli di licenza.
