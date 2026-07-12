# ROADMAP — Asset gratuiti e evoluzione del gioco

## 1. Cosa c'è GIÀ nel progetto (da oggi)

In `assets/maps/` ci sono **9 battlemap incluse** (`mappa_01.png` … `mappa_09.png`): un unico
mondo continuo 3072×3072 — bosco, prati, lago con fiume, strada con ponte sul guado,
villaggio, campi arati, rocce e palude — disegnato per intero e poi tagliato in 9 tessere,
così le cuciture combaciano **al pixel**. Aprendo la vista **🧩 Mondo cucito** il mondo
appare subito, senza dover scaricare nulla. Sono generate proceduralmente per questo
progetto: **nessun vincolo di licenza**, si possono ridistribuire, modificare, sostituire.

Sono il *set di partenza*: appena importi battlemap artistiche (vedi sotto) in `user://maps`,
quelle prendono il posto di queste (la cartella utente ha priorità).

## 2. Asset gratuiti dai siti: quali, dove, e cosa dice la licenza

⚠️ **Regola d'oro**: *usare* un asset nel tuo gioco in locale e *ridistribuirlo* (committarlo
in questo repository GitHub pubblico) sono due cose diverse. Quasi tutti i pacchetti gratuiti
permettono la prima e **vietano la seconda**. Per questo il flusso consigliato è sempre:
scarichi tu → trascini sulla finestra del gioco → finiscono in `user://maps` (fuori dal
repository, sopravvivono agli aggiornamenti, e non violi nessuna licenza).

### Fonti consigliate

| Fonte | Cosa offre gratis | Licenza | Può entrare nel repo? |
|---|---|---|---|
| **Forgotten Adventures** (forgotten-adventures.net) | Mappe + enorme pack di token/asset (alberi, casse, mobili…) | Uso personale/commerciale nei propri contenuti, **niente ridistribuzione dei file** | ❌ solo `user://maps` |
| **2-Minute Tabletop** (2minutetabletop.com) | Battlemap e asset PNG | perlopiù CC-BY-NC (attribuzione, non commerciale) | ❌ solo `user://maps` |
| **Cze & Peku** (Patreon, post pubblici) | Battlemap di altissima qualità, pack gratuiti mensili | Uso personale | ❌ solo `user://maps` |
| **Dyson Logos** (dysonlogos.blog) | Centinaia di mappe di dungeon disegnate a mano | Uso personale (e commerciale per molte, vedi singola mappa) | ❌ solo `user://maps` |
| **Kenney** (kenney.nl) | Migliaia di asset di gioco (tileset, UI, icone) | **CC0** (dominio pubblico) | ✅ SÌ |
| **OpenGameArt** (opengameart.org) | Di tutto — filtra per licenza | Varia: **filtra per CC0** | ✅ solo i CC0 |
| **Dungeon Scrawl** (dungeonscrawl.com) | Editor di mappe gratuito nel browser | Le mappe che esporti sono TUE | ✅ SÌ |

### Come importare (il flusso completo, 30 secondi)

1. Scarica il pacchetto dal sito (es. il *Free Pack* di Forgotten Adventures);
2. estrai lo zip in una cartella qualsiasi;
3. avvia il gioco → vista **🧩 Mondo cucito**;
4. **trascina i PNG/JPG/WebP sulla finestra del gioco**: copiati in `user://maps`, mondo
   ricucito in automatico. Fine.
5. (in alternativa: **📁 Apri cartella mappe** e incollaci i file, poi **🔄 Ricarica mappe**)

Consigli: rinomina i file con prefissi ordinabili (`01_`, `02_`…) per controllare la
disposizione nella griglia; usa mappe della stessa risoluzione per il risultato migliore.

## 3. Roadmap delle funzionalità

### ✅ Fase A — Fondamenta del Mondo cucito (fatta)
- [x] Stitcher a griglia con riscalo alla cella comune (zero buchi)
- [x] Coerenza visiva: color grading + seam blending + ciclo giorno/notte
- [x] Culling VRAM hardware-aware (target 6 GB, convivenza con LLM locale)
- [x] Cartella `user://maps` persistente + fallback `assets/maps`
- [x] Drag & drop dei file sulla finestra
- [x] Minimappa cliccabile + griglia da battaglia + fix zoom + Inquadra tutto
- [x] 9 battlemap incluse (mondo 3×3 senza cuciture visibili)
- [x] **Atmosfera**: ombre di nuvole in movimento, lucciole di notte, pulviscolo di
      giorno, transizioni dell'ora in dissolvenza (1.2s), vignetta + grana cinematografica

### 🔜 Fase B — Il mondo si gioca (prossima)
- [ ] **Token del party sul Mondo cucito**: trascinabili, con snap alla griglia
- [ ] **Righello**: click-e-trascina per misurare distanze in celle/metri
- [ ] **POI ed etichette**: nomi dei luoghi sopra la mappa (Ventimiglia, il guado…)
- [ ] **Fog of war del mondo**: si dirada dove il party è passato
- [ ] Spostamento narrato: il Master IA muove il party sul mondo (già c'è per i POI 2D)

### 🔮 Fase C — Props e regia
- [ ] **Props posizionabili** (alberi, casse, mobili PNG con alfa — qui brillano gli asset
      di Forgotten Adventures scaricati dall'utente): posizionamento con snap, rotazione,
      layer sopra/sotto i token. **Punto di partenza già pronto**: `tools/blender/
      genera_props.py` renderizza 8 props top-down trasparenti direttamente da Blender
      (via Claude Desktop + Blender MCP, o a mano — vedi `tools/blender/README.md`)
- [ ] Salvataggio del layout props in `user://` (sopravvive agli aggiornamenti)
- [ ] Pennello luci: piazza PointLight2D (falò, lanterne) con un click
- [ ] Musiche/ambience per zona del mondo (bosco ≠ villaggio ≠ palude)

### 🌐 Fase D — Il tavolo completo
- [ ] Multiplayer via Supabase (l'outbox è già pronto)
- [ ] Export eseguibile Windows (filtri risorse `*.png,*.jpg,*.webp` già documentati)
- [ ] Campagna demo di Ventimiglia inclusa (POI + incontri + loot già nel motore)
