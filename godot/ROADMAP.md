# ROADMAP COMPLETA — Ultimate VTT "Tavolo Oscuro di Ventimiglia" (Godot 4)

Lo stato di TUTTO il progetto: cosa c'è già, cosa arriva, come si usano gli asset.
Aggiornata a: luglio 2026.

---

## PARTE 1 — Cosa il gioco SA GIÀ FARE

### ⚔️ Cuore di gioco (portato dal monolite JS, tutto in Godot)
- **Personaggi D&D 5e**: schede complete (caratteristiche, tiri salvezza, abilità,
  competenze, dadi vita), creazione guidata con 6 classi (Guerriero, Barbaro, Ladro,
  Ranger, Mago, Chierico) e razze, progressione/XP
- **Combattimento a turni**: iniziativa, economia delle azioni (azione/bonus/movimento),
  menu azioni dinamico da classe/razza/inventario, condizioni, fiancheggiamento,
  elevazione, superfici, IA dei nemici
- **Encounter Balancer**: budget di minaccia dal party REALE (numero, livelli, HP attuali)
  — quantità e statistiche dei nemici scalate per uno scontro equo
- **Bestiario**: 8 creature (Goblin, Bandito, Scheletro, Lupo, Orco, Cultista, Zombie,
  Hobgoblin) con statistiche 5e; la chat del Master fa PARTIRE il combattimento vero
  quando narra uno scontro (sinonimi inclusi: "briganti"→Banditi, "ombre"→Scheletri)
- **Armeria e loot**: rarità comune/rara/epica/leggendaria, armature, amuleti, armi di
  classe; drop scalati sulla forza del nemico (CR); uso oggetti anche in combattimento
- **Master IA**: bridge Ollama con endpoint remoto configurabile e streaming (Split-Rig:
  il client resta leggero, l'LLM gira altrove); voce del Master (TTS con coda);
  chat→viaggio sui POI di Ventimiglia
- **Mappa tattica** (combattimento): griglia con click-to-move stile BG3, righello,
  ostacoli/highground, sfondo immagine personalizzabile, **token art automatica**
- **Dadi 3D**, barra XP, pannelli Master, salvataggi, memoria di campagna

### 🧩 Mondo cucito (open-world dalle battlemap — la vista "regia")
- **Stitching a griglia perfetta**: le immagini in cartella diventano UN mondo continuo
  (ordine alfabetico, ~√N colonne, riscalo alla cella comune: zero buchi)
- **Coerenza visiva**: micro color-grading per-chunk verso la media del set + seam
  blending shader + tinta globale — pacchetti diversi, un solo mondo
- **Culling VRAM hardware-aware**: fuori vista si nasconde, lontano la texture LASCIA la
  VRAM (budget per l'LLM locale sulla stessa macchina)
- **Due cartelle mappe**: `user://maps` (SOPRAVVIVE agli aggiornamenti, consigliata) con
  fallback `assets/maps`; **drag & drop** dei PNG/JPG/WebP direttamente sulla finestra
- **9 battlemap incluse**: mondo 3×3 senza cuciture (bosco, lago, fiume col guado,
  villaggio, campi, rocce, palude) — il Mondo cucito funziona appena installi
- **Navigazione**: zoom-to-cursor senza scatti, "🗺 Inquadra tutto", **minimappa
  cliccabile** (miniatura + rettangolo vista + click-teletrasporto)
- **▦ Griglia da battaglia** (OFF/64/128/256), quasi a costo zero
- **🎭 Token del party**: trascinabili, snap alla cella, posizioni persistenti, arte
  della classe automatica
- **📏 Righello**: distanze in celle e metri (1 cella = 1,5 m)
- **🏷 Etichette dei luoghi**: `etichette.json` per set di mappe (8 nomi inclusi),
  NASCOSTE dalla nebbia finché non esplori
- **🌫 Fog of war**: si dirada spostando i token, esplorato persistente
- **🌳 Props posizionabili**: alberi, rocce, botti, falò... click piazza, trascina
  sposta, destro elimina; snap alla griglia; layout salvato in `user://`; palette
  estendibile coi TUOI PNG (`user://props`); 8 props inclusi
- **Atmosfera**: ombre di nuvole in movimento, lucciole al tramonto/notte, pulviscolo di
  giorno, ciclo giorno/tramonto/notte/dungeon in DISSOLVENZA, vignetta cinematografica
- **Ciclo del giorno** coordinato: tinta + nuvole + particelle cambiano insieme

### 🎨 Asset inclusi e pipeline Blender
- **14 token** (8 mostri + 6 classi) in `assets/tokens` — stile anello pulito
- **8 props 2D** in `assets/props`
- **Script Blender** in `tools/blender/` (da eseguire sul TUO PC, anche via Claude
  Desktop + Blender MCP):
  - `genera_props.py` → 8 props 3D top-down → `Desktop/vtt_props`
  - `genera_bestiario.py` → le 14 MINIATURE 3D su basetta → `Desktop/vtt_tokens`
- **Le cartelle `user://` vincono sempre**: `user://tokens` e `user://props` sostituiscono
  gli asset inclusi per nome, e sopravvivono a ogni aggiornamento

---

## PARTE 2 — Asset gratuiti dai siti (regole d'oro)

⚠️ *Usare* un asset nel tuo gioco e *ridistribuirlo* (metterlo nel repository) sono cose
diverse. Il flusso sicuro è sempre: scarichi tu → `user://` → nessuna licenza violata.

| Fonte | Cosa | Licenza | Nel repo? |
|---|---|---|---|
| Forgotten Adventures | mappe + token/asset enormi | personale, no ridistribuzione | ❌ solo `user://` |
| 2-Minute Tabletop | battlemap e asset | CC-BY-NC | ❌ solo `user://` |
| Cze & Peku | battlemap top | personale | ❌ solo `user://` |
| Dyson Logos | dungeon disegnati a mano | personale | ❌ solo `user://` |
| Kenney.nl | asset di gioco | **CC0** | ✅ sì |
| OpenGameArt (filtro CC0) | di tutto | **CC0** | ✅ sì |
| Dungeon Scrawl | editor mappe browser | le mappe sono TUE | ✅ sì |

Import: **trascina sulla finestra** (mappe) o copia in `user://tokens` / `user://props`.

---

## PARTE 3 — Cosa manca (le prossime fasi)

### ✅ Fase D — Il mondo VIVO (fatta)
- [x] **Spostamento narrato sul mondo**: quando il Master (prosa o comando `moveTo`)
      sposta il party su un POI il cui nome combacia con un'etichetta del mondo, i token
      PLANANO lì in 2,2 s (disposti in cerchio), la camera segue morbida e la nebbia si
      dirada a destinazione — basta dare alle etichette gli stessi nomi dei POI
- [x] **Luci sui props di fuoco**: piazzare un falò/lanterna/torcia accende una
      PointLight2D vera — di notte scava una pozza di luce calda nel buio; le luci si
      spengono da sole fuori inquadratura (culling già esistente)
- [x] **Rotazione e scala dei props**: col prop in mano, rotella = scala (0,4×–3×),
      R = ruota a scatti di 15°; tutto persistente
- [x] **Audio per zona**: già coperto a livello POI dall'AmbienceManager (reagisce a
      `party_location_changed`); zone custom per-mappa restano possibili in futuro

### 🔮 Fase E — Il tavolo condiviso
- [ ] **Multiplayer via Supabase**: l'outbox con debounce c'è già; manca il canale di
      ritorno e la riconciliazione degli stati
- [ ] Ruoli Master/giocatore (il Master vede tutto, i giocatori vedono la nebbia)
- [ ] **Export eseguibile Windows**: preset con filtri `*.png,*.jpg,*.webp,*.json`
      (documentati); build one-click

### 🏰 Fase F — La campagna
- [x] **Campagna demo "L'Ombra sul Confine"**: 6 capitoli GIOCABILI sul mondo incluso.
      Come si gioca: apri 🧩 Mondo cucito e porta i token del party nei luoghi degli
      obiettivi (trascinandoli, o lasciando che il Master IA li muova narrando). Arrivati
      nel posto giusto parte il capitolo: lore in chat, incontro BILANCIATO sul party
      reale quando previsto, ricompensa dalla pipeline del loot alla vittoria (oggetti
      dell'armeria + oro), obiettivo successivo annunciato. In caso di TPK il capitolo
      resta lì: ci si rimette in forze e si torna. Progresso salvato in
      `user://campagna.json` (cancella il file o chiama `CampaignDirector.reset_campagna()`
      per rigiocarla). Arco: Villaggio di Confine → Il Guado (agguato) → Bosco Vecchio
      (lupi) → Lago Chiaro (le rune) → Rocce del Tramonto (avamposto) → Palude Grigia
      (il culto, finale "difficile") → epilogo con l'Occhio di Ventimiglia
- [ ] Editor incontri visuale (ora si fa da chat/JSON)
- [ ] Import guidato dei pacchetti Forgotten Adventures (cartelle per categoria)
- [ ] Campagne su mappe utente: basta un `etichette.json` coi luoghi e un JSON di
      campagna con quei nomi — il motore è già pronto

### 🧪 Debito tecnico e qualità
- [ ] Test di integrazione in editor (gli script sono verificati col parser reale +
      specchi Python della matematica, ma manca una suite dentro Godot)
- [ ] Ripulire i warning stilistici del linter (righe lunghe legacy)
- [ ] Profiling con molte mappe 4K+ (il culling regge, la minimappa va misurata)

---

## PARTE 4 — Audit "verso il capolavoro" (luglio 2026)

### ✅ Combat system: 4 bug reali TROVATI e CORRETTI (lettura integrale dei moduli)
1. **La scheda non contava nulla in attacco**: tutti i PG colpivano con +4 e 1d8+2 fissi.
   Ora bonus = competenza + miglior modificatore (FOR/DES/INT/SAG) e danno = dado della
   classe (barbaro 1d12, mago 1d10, chierico 1d6…) + modificatore — e si aggiorna al
   level-up. Un barbaro adesso picchia da barbaro.
2. **Condizioni e superfici infestavano lo scontro successivo**: nessuno chiamava i
   `reset()` — col round riazzerato la scadenza non scattava MAI (differenza negativa) e
   il combattimento nuovo partiva con veleni e fiamme fantasma del precedente. Ora
   `end_combat()` li pulisce (l'elevazione resta: è terreno, non un effetto).
3. **Turno assegnato a un morto** dopo la rimozione di un PNG da parte del Master: il
   giro poteva bloccarsi su un combattente sconfitto. Ora passa al prossimo VIVO.
4. **I nemici si accatastavano sulla stessa cella**: l'IA ora evita le celle occupate
   (accorcia il passo fino a trovarne una libera).
   Tutte le correzioni verificate con specchi Python (attacco da scheda, salto dei
   morti, anti-sovrapposizione).

### 🗺 Mondo v2: LA mappa giocabile
Rigenerato il mondo 3×3 come un luogo vero: **sentieri che collegano ogni tappa della
campagna**, villaggio con palizzata (varchi sulle strade), pozzo in piazza e 8 case,
**cerchio di pietre con alone violaceo nella Palude Grigia** (l'arena del finale si
riconosce da lontano), accampamento alle Rocce con tende/gabbie vuote/braci (il racconto
del capitolo 5 è NEL disegno), molo e barchetta sul Lago Chiaro, rovine di una torre nei
Prati del Nord, canneti attorno al Guado (l'imboscata "si sente"), fiori nei prati.

### 🎯 Prossimi passi per il capolavoro (in ordine di impatto)
1. **Attacco a distanza**: portata per arco/incantesimi (oggi tutto è mischia a 1 cella;
   ranger e mago dovrebbero colpire da lontano, e l'IA arciera tenere la distanza)
2. **Export eseguibile Windows** (Fase E): giocare con un doppio click, senza editor
3. **Feedback di colpo**: flash/scossa del token colpito, numeri di danno fluttuanti,
   suono di dadi e lame — il "game feel" che trasforma un tracker in un gioco
4. **Tiri salvezza e aree**: palla di fuoco → tiro DES + superficie di fuoco (già pronta)
5. **IA tattica**: i nemici cercano il fiancheggiamento e l'altura invece di caricare
6. **Musica e SFX di combattimento** (l'AmbienceManager c'è; mancano gli stinger)
7. **Multiplayer Supabase** e ruoli Master/giocatore
8. **Asset "veri" dell'utente**: i render Blender (props/miniature) e i pacchetti
   Forgotten Adventures in `user://` — la pipeline è già tutta in piedi

---

## Come continuare lo sviluppo

Ogni sessione con Claude: chiedi una voce della Fase D/E/F, o incolla uno script di
`tools/blender/` in Claude Desktop (Blender MCP) per generare nuovi asset. Le mappe, i
token e i props che aggiungi in `user://` restano TUOI per sempre, aggiornamento dopo
aggiornamento.
