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

### ✅ Fatto nel giro "capolavoro" (luglio 2026)
- [x] **Attacco a distanza**: gittata dalla scheda in celle (ranger arco ~24, mago
      incantesimi ~12, gli altri mischia 1). `resolve_attack` valida la gittata; l'HUD non
      spreca l'azione se il bersaglio è troppo lontano e lo dice.
- [x] **IA arciera (kiting)**: un PNG a distanza indietreggia se lo prendi in mischia, si
      porta a tiro se sei fuori portata, e colpisce da lontano — evitando le celle occupate
      e senza uscire dalla griglia. (I nemici da mischia caricano come prima.)
- [x] **Game feel**: il token colpito **vibra e lampeggia di rosso**, e sale un **numero
      di danno fluttuante** (rosso; verde per le cure; **"CRIT! -N" dorato** sui critici).
      Effetti effimeri che si spengono da soli (nessun costo a riposo).
- [x] **Export eseguibile Windows**: `export_presets.cfg` pronto (preset "Windows Desktop",
      pck incorporato, filtri risorse giusti) + guida `ESPORTA_WINDOWS.md`. Giocare con un
      doppio click, senza editor.

### ✅ Secondo giro "capolavoro" (luglio 2026)
- [x] **SFX di combattimento SINTETIZZATI** (9 stinger inclusi, zero licenze): dadi
      all'iniziativa, thud di mischia, whoosh del mancato, freccia per i tiri a distanza,
      squillo del CRITICO, carillon di cura, tonfo del nemico a terra, fanfara di
      vittoria, sweep di magia. Autoload `CombatSfx` con pool di 4 player: i suoni si
      sovrappongono senza tagliarsi, agganciato ai signal (nessun modulo sa che esiste).
- [x] **Tiri salvezza + PALLA DI FUOCO del Mago**: `saving_throw` dalla scheda vera per i
      PG (proxy onesto per i PNG), pulsante 🔥 che compare SOLO al turno del Mago —
      esplosione raggio 2 celle centrata sul bersaglio, tiro DES (CD = 8 + competenza +
      INT) per TUTTI nel raggio, alleati compresi (il fuoco amico è D&D vero), metà danno
      a chi salva, e l'area resta IN FIAMME (superficie di fuoco nei round successivi).
- [x] **IA fiancheggiante**: il nemico da mischia che può chiudere il turno in mischia
      sceglie la cella adiacente che crea FIANCHEGGIAMENTO con un alleato ("ti aggira e
      ti prende ai fianchi!") invece di mettersi in fila indiana.

### ✅ Terzo giro "capolavoro" (luglio 2026)
- [x] **IA e ALTURA**: il nemico da mischia sceglie la cella adiacente SOPRAELEVATA quando
      non può fiancheggiare (gerarchia tattica: fianco > altura > prima libera — "guadagna
      l'altura e incombe su di te!"); l'arciere già a tiro SALE sulla collina dipinta più
      alta raggiungibile che tenga il bersaglio in gittata senza finire in mischia
      ("sale sull'altura, arco teso"). Helper `_celle_occupate` condiviso da tutte le
      manovre (niente più copie).

### ✅ Dungeon giocabili: Castello + Banca del Drago d'Oro (luglio 2026)
- [x] **Selettore di Set** nella toolbar del Mondo cucito: menu a tendina
      **🌍 Mondo / 🏰 Castello / 🏦 Banca** — cambia cartella e ricostruisce il mondo al volo
      (`WorldBuilder.cartella_forzata`, letta prima del `_ready`, bypassa `user://maps` e il
      fallback `assets/maps` quando un set è selezionato).
- [x] **🏰 Castello** (`assets/maps_castello`, 2 tessere): superficie con mura/torri/mastio/
      sala del trono e sotterraneo con prigione/catacombe/camera rituale — dagli stessi
      blueprint di `genera_castello.py`, con etichette dei luoghi incluse.
- [x] **🏦 Banca del Drago d'Oro** (`assets/maps_banca`, 4 tessere): esterno, atrio, uffici,
      caveau — dagli stessi blueprint di `genera_banca.py`/`PIANTA_BANCA.md`, con etichette.
- [x] Entrambi generati come battlemap 2D (leggibili, colori vivi, stessa scala 1 cella =
      1,5 m) così sono **giocabili subito**, senza aspettare i render 3D di Blender — che
      restano disponibili come upgrade opzionale (sostituiscono i PNG con render migliori,
      stesso nome cartella).

### ✅ Modalità Terra di Mezzo (luglio 2026)
- [x] **Bestiario** (`data/monsters.json`, +25 voci): tutte le fazioni della Guerra
      dell'Anello — Goblin di Moria, Uomini Selvaggi di Dunland, Orchi di Isengard,
      Corsari di Umbar, Uruk-hai (soldato/arciere Haradrim/capitano), Spettro della Palude,
      Troll delle Caverne, Grima Vermilinguo, Guardiano nell'Acqua, gli 8 Nazgûl minori
      nominati (Khamûl, Akhorahil, Ren, Adûnaphel, Uvatha, Hoarmurath, Dwar, Ji Indur), il
      Re Stregone di Angmar, Saruman il Bianco, la Bocca di Sauron, il Drago delle Montagne
      Grigie, Shelob e il Balrog di Morgoth — CR bilanciati sulla stessa scala del resto del
      bestiario (l'Encounter Balancer li scala già su qualunque party, da livello 1 a 20).
      L'Occhio di Sauron resta puramente narrativo (non è un mostro da combattere: è la
      minaccia che si spegne nell'epilogo).
- [x] **🧙 Set "Terra di Mezzo"** (`assets/maps_terra_di_mezzo`): stessi 9 tile del Mondo
      cucito, nuove etichette storicamente coerenti sul terreno giusto — Bree (villaggio
      di confine), Guado di Bruinen (il guado), Bosco Atro (bosco), Campi di Rohan
      (pianura), Nen Hithoel (lago), Cancello Ovest di Moria (tile senza etichetta),
      Emyn Muil (rocce), Campi del Pelennor (campi dorati), Paludi Morte (palude), più
      Cirith Ungol e i Cancelli Neri.
- [x] **Campagna "L'Ultima Alleanza si Spezza"** (`data/campagna_terra_di_mezzo.json`,
      9 capitoli): Bree → Guado di Bruinen (inseguimento dei Nazgûl) → Bosco Atro → Moria
      (Guardiano nell'Acqua al cancello, poi Balrog sul ponte di Khazad-dûm) → Rohan
      (Grima Vermilinguo) → Campi del Pelennor (Re Stregone di Angmar) → Cirith Ungol
      (Shelob) → Cancelli Neri (la Bocca di Sauron) → epilogo con lo spegnersi dell'Occhio
      di Sauron. Ricompense nuove in `data/armeria.json` (Lama del Ramingo, Cotta di
      Mithril, Arco Galadhrim, La Lama Ricomposta, Stella Serena...). Saruman e il Drago
      restano nel bestiario come incontri opzionali per il Master, fuori dall'arco fisso.
- [x] **Multi-campagna** in `CampaignDirector`: `CAMPAGNE` elenca gli archi disponibili,
      `imposta_campagna(id)` ricarica capitoli/indice e ha **salvataggio separato per
      campagna** (`user://campagna_<id>.json` — Ventimiglia e Terra di Mezzo procedono in
      parallelo senza calpestarsi). Il cambio pubblica `"campagna:cambiata"` su
      `GameState`, e `world_view.gd` lo intercetta per allineare da solo il Set di mappe
      giusto (menu a tendina campagna accanto al menu Set nella toolbar del Mondo cucito).

### ✅ Scelta campagna all'avvio + nemici a distanza reale sul Mondo cucito (luglio 2026)
- [x] **`CampaignSelectScreen`**: prima schermata all'avvio (prima ANCHE della creazione del
      personaggio) — una card per campagna (oggi Ventimiglia/Terra di Mezzo, ogni futura
      campagna in `CampaignDirector.CAMPAGNE` compare qui da sola). La scelta chiama
      `imposta_campagna` (allinea gia' Set di mappe e salvataggio) e poi passa alla creazione
      del party, invariata.
- [x] **`WorldEnemyTokens`**: quando l'Encounter Balancer evoca un PNG, il suo gettone compare
      ANCHE sul Mondo cucito (non solo nella griglia tattica astratta), a distanza reale dal
      party — stessa scala del righello (1 cella = 1,5 m): mischia a ~3 celle, tiro alla
      propria gittata (`attackRange` del bestiario, fino a 18 celle per l'Arciere Haradrim, 14
      per Saruman, 8 per il Drago — aggiunto il campo dove mancava, attiva anche la vera IA a
      distanza/kiting per quei nemici). Sparisce alla sconfitta del singolo nemico o a fine
      scontro; puramente visivo, la posizione di gioco autorevole resta la mappa tattica.

### ✅ FIX: il Master IA ora e' davvero campagna-consapevole (luglio 2026)
- [x] **Bug**: scegliendo Terra di Mezzo, il Master IA (AIBridge) continuava a narrare
      Ventimiglia — il suo system prompt aveva "ambientata a Ventimiglia" e la whitelist
      mostri FISSA agli 8 originali scritti nel codice, del tutto ignari di CampaignDirector.
- [x] **`CampaignDirector.ambientazione_attuale()` / `bestiario_attuale()`**: ogni voce di
      `CAMPAGNE` porta ora una descrizione di ambientazione e il tag "set" del suo bestiario.
      `data/monsters.json` etichetta ogni mostro con `"set": "ventimiglia"` o
      `"set": "terra_di_mezzo"`.
- [x] **`AIBridge`**: il system prompt (prosa e Modalita' Storia) usa l'ambientazione della
      campagna ATTIVA e costruisce la whitelist mostri/esempi al volo filtrando per "set" —
      niente piu' testo fisso.
- [x] **`ChatCombatBridge`**: la rete di sicurezza che riconosce mostri nella prosa del Master
      ora ha un bestiario/sinonimi/default SEPARATO per campagna (bestiario Terra di Mezzo
      completo, Nazgul con nomi accentati inclusi).
- [x] **`ChatTravelBridge`**: il rilevamento "il Master ha narrato uno spostamento" verso i POI
      REALI di Ventimiglia (Porto Turistico, Torre dell'Orologio...) ora e' attivo SOLO durante
      la campagna Ventimiglia — altrimenti una parola generica della prosa Terra di Mezzo
      ("il ponte", "la torre") poteva teletrasportare per sbaglio il party su un POI reale.
- [x] **`CampaignMemory`**: il diario di campagna (memoria a lungo termine del Master) e' ora
      SEPARATO per campagna (`imposta_campagna`, chiamato da CampaignDirector) — gli eventi di
      Ventimiglia non finiscono piu' nel contesto del Master mentre si gioca in Terra di Mezzo.
- [x] Rimosso anche il banner statico "Benvenuti a Ventimiglia" della Chat Master (ora generico:
      l'intro vera arriva subito dopo, dalla campagna scelta).

### ✅ Token art per il bestiario Terra di Mezzo (luglio 2026)
- [x] **Bug**: i nemici di Terra di Mezzo (Khamûl, Uruk-hai, Shelob...) comparivano sulla mappa
      come un cerchio spoglio con la sola iniziale — il fallback di `TokenArt`/`WorldTokens`
      quando non trova un PNG, mentre i PG e il bestiario originale mostrano un vero distintivo
      (anello colorato, lettera in rilievo, marcatore a rombo).
- [x] **25 nuovi PNG** in `assets/tokens/` (256×256, stesso stile grafico degli originali —
      anello/riempimento radiale/rombo — con palette dedicata per fazione: verde goblinoide,
      bianco/nero Isengard, ambra Harad, nero/porpora per i Nazgul, bianco avorio per Saruman,
      fuoco per il Balrog...).
- [x] **`TokenArt.ALIAS`** esteso: i nomi normalizzati ("goblin di moria", "khamûl lo stregone
      orientale"...) sono mappati ai file — verificato con una simulazione Python di tutta la
      pipeline di normalizzazione: tutti e 25 risolvono al file giusto, nessuno mancante.

### ✅ Animazione del combattimento sul Mondo cucito (luglio 2026)
- [x] **`WorldCombatFX`**: nuovo overlay che da' VITA al colpo sulla mappa dove stanno i token,
      finora fermi durante lo scontro. Ascolta i signal di CombatManager e disegna:
      - MISCHIA → l'attaccante SCATTA verso il bersaglio e torna (affondo, `applica_scatto` sul
        token vero, sia party che nemico);
      - DISTANZA (gittata > 1: arcieri/maghi) → un PROIETTILE vola dall'attaccante al bersaglio;
      - IMPATTO → anello che si espande + scintille sul bersaglio;
      - NUMERI → danno "-N" (rosso), "CRIT! -N" (giallo), cura "+N" (verde) che salgono e sfumano;
      - MANCATO → "✗" grigio.
- [x] **Ordine dei signal gestito con cura**: dentro `resolve_attack`, `combatant_damaged` (ed
      eventualmente `combatant_defeated`, che RIMUOVE il token) arrivano PRIMA di
      `attack_resolved`. Percio' la posizione del bersaglio si cattura al danno (token ancora
      presente → anche il COLPO DI GRAZIA mostra numero/scintilla/affondo) e il numero si crea
      in differita leggendo il flag di critico impostato subito dopo (il "CRIT!" e' corretto a
      prescindere dall'ordine). Tracciate a mente tutte le casistiche (mischia, distanza, cura,
      mancato, colpo mortale, attaccante fuori mappa, Palla di Fuoco).
- [x] Tutto in scala-schermo (leggibile a ogni zoom); l'overlay si spegne da solo quando non ci
      sono effetti attivi (`set_process(false)`).

### ✅ I TUOI token dipinti, senza toccare il codice (luglio 2026)
- [x] `assets/tokens/README.md` con la tabella COMPLETA nome-mostro → file (`<id>.png`) e le
      regole di priorita': `user://tokens/<id>.png` (i tuoi) vince su tutto. Basta rinominare i
      ritratti della tua Asset Library e metterli li'.
- [x] Pulsante **"🎭 Cartella token"** nella toolbar del Mondo cucito: apre `user://tokens` in un
      click (creandola se manca), cosi' trascinarci dentro i ritratti e' immediato.

### ✅ UNA SOLA MAPPA: il Mondo cucito e' tutto il gioco (luglio 2026)
- [x] **Rimosse le altre viste**: Mappa tattica astratta, overworld di Ventimiglia e Dungeon
      Nexus non esistono piu' (file eliminati: `tactical_map.gd`, `overworld_map.gd`,
      `nexus_view.gd`, `map_manager.gd`, `dungeon_generator.gd`) — via anche il toggle a 4 vie
      e il pulsante "Sfondo mappa". Il centro e' SEMPRE il Mondo cucito: la mappa interattiva
      della campagna (Terra di Mezzo di default, prima voce di `CAMPAGNE`).
- [x] **Il combattimento e' AUTOREVOLE sulla mappa cucita** (1 cella = 128 px = 1,5 m, la
      stessa scala del righello): le celle di CombatManager (gittata, fiancheggiamento,
      elevazione, IA, Palla di Fuoco) ora le scrivono i token del mondo —
      `WorldTokens` pubblica le celle dei PG (rilascio del trascinamento, fine viaggio narrato,
      inizio scontro), `WorldEnemyTokens` registra la cella allo spawn (snap al centro cella) e
      SEGUE `combatant_position_changed`: avanzate, fughe e fiancheggiamenti dell'IA nemica si
      VEDONO sulla mappa vera. Alla sconfitta la cella si libera.
- [x] **IA senza bordi fissi**: i limiti di manovra (26×18 della vecchia griglia) ora si
      calcolano dalle celle dei combattenti in scena + un turno di margine
      (`_limite_massimo()`): si combatte ovunque sulla mappa, anche a cella (24, 22) sotto
      Brea. Matematica verificata con simulazione Python (andata-ritorno celle, spawn mischia
      ~3 celle, arciere sempre a tiro, limiti dinamici).
- [x] **Nebbia del Master sul mondo**: svela/rinnebbia del cassetto Strumenti agiscono sulla
      `WorldFog` del Mondo cucito (`svela_tutto`/`rinnebbia_tutto`; il rinnebbia riscopre
      subito attorno ai token del party). I pulsanti "Evoca" pescano dal bestiario della
      campagna attiva (avanguardia = il piu' fragile ×2, bruto = il gregario piu' tosto).

### ✅ Ogni nemico ha la sua storia (e combatte di conseguenza) + import token in un click (luglio 2026)
- [x] **Lore nel bestiario**: tutti i 33 mostri di `data/monsters.json` hanno una "lore" di una
      riga (ogni Nazgul ha la SUA storia: Khamul fiuta i forti di spirito, Dwar il Signore dei
      Cani bracca il capobranco, Adunaphel la Silente punta il campione senza un suono...).
      Annunciata in chat alla PRIMA comparsa del tipo in uno scontro (`CombatManager.add_npc`,
      dedup per scontro) e data al Master IA per i soli nemici in scena
      (`AIBridge._lore_nemici_context_text`: prompt compatto, i limiti Groq ringraziano).
- [x] **Comportamenti guidati dalla storia** (`"comportamento"` nel bestiario, letto dall'IA
      via `catalogId` sul combattente): **codardo** (goblin, Grima: sotto il 35% HP scappa),
      **berserker** (orchi, Uruk-hai, troll, Balrog: carica dritto, niente fianchi ne'
      alture), **cacciatore** (lupi, Shelob, il drago: bersaglia il PG con MENO HP),
      **terrore** (i Nazgul: bersaglia il PIU' FORTE, per spezzare il coraggio), **guardiano**
      (il Guardiano nell'Acqua: NON insegue, difende il suo stagno), **tattico/standard**
      (fiancheggiamenti e kiting di sempre).
- [x] **Import dei token dell'utente in un click**: pulsante "📥 Importa token" (selettore
      multi-file → copia in `user://tokens` → cache azzerata) + **match FUZZY per parole** in
      `TokenArt`: i ritratti di una libreria si agganciano ai mostri SENZA rinominare nulla —
      radice a 6 lettere (singolari/plurali: "Corsari"≈"corsaro", "Trolls"≈"troll"), accenti
      ridotti (Khamûl≈khamul), stopword ignorate, a parita' vince il nome file piu' corto; il
      nome esatto `<id>.png` continua a vincere su tutto. Verificato con simulazione Python su
      nomi file realistici della libreria dell'utente: 16/17 agganciati, zero falsi positivi
      (Isengard NON prende il ritratto di Mordor).

### ✅ Il Master fa comparire i token dei nemici quando dichiara lo scontro (luglio 2026)
- [x] **Prompt piu' imperativo**: ogni volta che il Master dichiara un combattimento DEVE
      emettere `addNpc` (uno per tipo) + `startCombat` dopo `<<DATI>>` — il prompt ora dice
      esplicitamente che senza quei comandi i nemici NON compaiono sulla mappa.
- [x] **Risoluzione FUZZY dell'id nemico** (`AIBridge._risolvi_id_nemico`): l'`addNpc` del
      Master viene agganciato al bestiario della campagna ATTIVA anche se scrive "Uruk-hai",
      "uruk hai" o il nome italiano completo — match su id/nome esatto, poi contenimento
      reciproco; se non riconosce nulla ripiega sul gregario base del set (qualcosa DEVE
      comparire), MAI su un mostro di un'altra ambientazione. Verificato con simulazione
      Python: id/nomi/maiuscole/spazi tutti risolti, e un id di Ventimiglia chiesto in
      Terra di Mezzo ripiega su un mostro LOTR, non su quello sbagliato.
- [x] **Auto-`startCombat`**: se il Master evoca i nemici ma dimentica `startCombat`, lo
      avviamo noi — "dichiarare lo scontro" fa sempre partire i turni e comparire i token.
      Nessun doppione con la rete di sicurezza `ChatCombatBridge` (che interviene solo quando
      il Master NON emette comandi di spawn).

### ✅ Campagna a RACCONTO ramificato con boss e prove di dado (luglio 2026)
- [x] **"Il Fardello dell'Ombra"** (`data/storia_terra_di_mezzo.json`): un'avventura-libro
      **dettagliata di 54 nodi in 5 atti** — da Brea al Monte Fato — con prosa ricca (4-8 frasi
      per nodo) e rami che divergono davvero. Filo narrativo: NON portate voi l'Anello, ma
      tenete aperta la strada e attirate su di voi lo Sguardo perche' il vero portatore arrivi al
      fuoco. **14 boss fight** che usano **TUTTI i 25 nemici** del bestiario LOTR almeno una
      volta: Spettri della Palude (agguato nelle Paludi Ditteri), Khamûl ad Amon Sûl, Ren +
      Akhorahil al Guado di Bruinen, Guardiano nell'Acqua alle Porte di Durin, Goblin di Moria +
      Troll a Mazarbul, Balrog sul Ponte, Adûnaphel + Hoarmurath in agguato all'uscita, Grima +
      Orchi a Meduseld, **Drago delle Montagne Grigie** (deviazione opzionale), Saruman + Uomini
      Selvaggi a Isengard, Capitano Uruk-hai + Uruk-hai + Arcieri Haradrim al Pelennor, Re
      Stregone + Uvatha + Dwar, Shelob a Cirith Ungol, Bocca di Sauron + Troll + Corsari + Ji
      Indur al Morannon. **~20 prove di dado** su tutte le sei caratteristiche (Furtivita',
      Persuasione, Percezione, Indagare, Arcano, Atletica, Volonta', Intuizione, Intimidire) con
      esiti diversi (scorciatoie, lore, ricompense, scontri piu' duri). Bivi veri (Isengard /
      Drago / Pelennor; Cirith Ungol / Morannon). Grafo VALIDATO (ogni riferimento/mostro/item
      esiste, tutto raggiungibile, nessun vicolo cieco, **ogni nodo puo' raggiungere il finale**)
      e SIMULATO: **5000/5000 partite casuali arrivano al finale**, ricompense mai doppie.
- [x] **`StoryDirector`** (autoload): regge nodi, opzioni, prove (1d20 + miglior modificatore
      del party vs CD → successo/fallimento portano a nodi diversi), boss fight (spawn
      bilanciato sulla mappa, alla vittoria si prosegue, a party sconfitto si puo' riprovare),
      ricompense (pipeline loot, mai doppie) e persistenza (`user://storia_terra_di_mezzo.json`).
- [x] **`CampaignStoryPanel`** (sostituisce la vecchia Storia-IA sul toggle **📖 Storia**):
      narrazione + pulsanti-opzione (le prove aprono il **vassoio dadi 3D**) + una riga di
      **testo LIBERO** in cui il giocatore puo' scrivere quello che vuole (agganciato all'opzione
      piu' simile per parole). I boss compaiono sulla mappa cucita coi loro token e la loro lore;
      vinto lo scontro il racconto prosegue da solo. Tutto **offline**, senza dipendere dal
      Master IA/Groq. Rimosso il vecchio `nlp_ui_controller.gd` (superato).

### ✅ Analisi di giochi simili → Tiri Salvezza contro la Morte (luglio 2026)
- [x] **Ricerca**: confronto con i VTT/CRPG di riferimento (Foundry VTT, Roll20, Baldur's Gate 3,
      Solasta). La lacuna piu' grossa e piu' "5e" del gioco: un PG a 0 PF era **eliminato di
      colpo**, mentre in ogni implementazione seria fa i **tiri salvezza contro la morte** e gli
      alleati possono rianimarlo. (Altri candidati emersi: copertura +2/+5 CA, concentrazione —
      annotati per il futuro.)
- [x] **Death saving throws** (regola D&D 5e completa): un PG a 0 PF diventa **MORENTE** (non
      morto). Al suo turno tira 1d20 — 10+ successo, altrimenti fallimento, **20 naturale = si
      rialza a 1 PF**, 1 = due fallimenti; 3 successi = **stabile**, 3 fallimenti = **morto**.
      Colpito mentre e' a terra subisce un fallimento (due se e' un critico); danno ≥ PF massimi
      = morte istantanea (danno massiccio). **Curarlo lo rimette in piedi** e azzera i tiri.
- [x] **Il TPK ora ha senso**: lo scontro non e' perso finche' un PG e' cosciente O morente (un
      morente puo' ancora rialzarsi con un 20 o una cura) — party_wiped scatta solo quando tutti
      sono stabili o morti. I PG morenti restano nel giro dei turni (solo per tirare), i nemici
      ignorano chi e' gia' a terra.
- [x] **`DeathSaves`** (autoload, come EnemyAI): al turno di un morente tira in automatico e passa
      il turno (esito in chat). **`CombatManager.stabilizza()`** + pulsante 🩹 nel cassetto
      Strumenti del Master (che ora mostra morente/stabile/morto coi contatori ✓/✗). Logica
      verificata con simulazione Python (5000 partite convergono; crit/danno massiccio/cura/nat20/
      wipe/eleggibilita' turni tutti corretti).

### ✅ Copertura e Concentrazione (dall'analisi, luglio 2026)
- [x] **Copertura** (`CoverManager`): un bersaglio riparato da un **prop** (albero, roccia,
      cassa) e' piu' difficile da colpire a distanza — **+2 CA** (mezza copertura) o **+5**
      (tre quarti). Le celle di copertura sono quelle dei props del Mondo cucito, registrate da
      `WorldProps` a ogni modifica del layout (scala fissa 128 px = 1 cella). `resolve_attack`
      controlla se un prop sta TRA attaccante e bersaglio (cella davanti al bersaglio, sulla
      linea verso chi tira) e alza la CA; la mischia la ignora (si e' adiacenti). Ora nascondersi
      dietro un ostacolo conta: verificato con simulazione (direzione corretta, colpi ridotti).
- [x] **Concentrazione + Benedizione** (`ConcentrationManager` + `CombatManager.benedici`): il
      **Chierico** ha un pulsante ✨ Benedizione (concentrazione): fino a **3 alleati** (se stesso
      compreso) tirano **+1d4 per colpire** finche' regge la concentrazione. Se l'incantatore
      **subisce danno** fa un TS su **Costituzione** (CD = max(10, meta' del danno)) o
      l'incantesimo si **spezza**; cadere a 0 PF (incosciente) la annulla comunque. Bless e
      Guidance marcati come `concentration` in `data/spells.json`. Verificato con simulazione
      (CD corretta, piu' danno = piu' facile spezzarla, bersagli max 3).

### ✅ Viaggio a DADI sul Mondo cucito — "la mappa calcola tutto" (luglio 2026)
- [x] **`TravelDirector`** (autoload): quando il Master vi fa spostare, il party **NON si
      teletrasporta**. Parte una **MARCIA**: la mappa misura la **distanza reale** dal gruppo alla
      meta (in pixel-mondo → km → giorni), la divide in **tappe** (2–8, in scala con la distanza),
      e si avanza **SOLO tirando il dado**. Ogni **1d20** copre una frazione di strada che dipende
      dal risultato: un tiro alto divora leghe, un **20** e' una cavalcata, un **1** una giornata
      storta (guadi in piena, nebbia, deviazioni). Quando la distanza percorsa raggiunge il totale,
      **si arriva** (l'evento `world:luogo` innesca i capitoli di campagna). Matematica pura,
      indipendente dai nodi: **SIMULATA** — 20.000 marce arrivano tutte (max 15 tiri, media ~6),
      **mai** oltre la meta; un tragitto tipico si fa in **~3–4 tiri**.
- [x] **Eventi di viaggio a tema**: ogni tappa puo' raccontare qualcosa (corvi che vi seguono,
      rovine di regni caduti, un grido nel cielo, fuochi lontani all'orizzonte) — pool diversi per
      Terra di Mezzo e Ventimiglia. Il **20** porta un buon auspicio, l'**1** un imprevisto.
- [x] **`TravelPanel`** (overlay del Mondo): barra di **progresso**, km/tappe/giorni residui,
      testo dell'evento e un unico grande tasto **🎲 Marcia (1d20)** che apre il **vassoio 3D**.
      Durante la marcia il **trascinamento dei token e' bloccato**: ci si muove solo col dado, come
      chiesto. **`WorldRoute`** disegna la **rotta sulla mappa** (tratto percorso pieno, resto
      tratteggiato, pennino sul punto raggiunto, bandierina sulla meta).
- [x] **Trigger dal Master e dal giocatore**: il comando `moveTo` del Master, fuori Ventimiglia,
      instrada la meta sul Mondo cucito (`GameState "mappa:viaggia"` → `WorldBuilder.viaggia_verso`)
      e fa partire la marcia; un selettore **🧭 Viaggia a…** in toolbar elenca i luoghi del set
      attivo per partire a mano. Interruttore **🎲 Viaggio a dadi: ON/OFF** (default ON) per tornare
      al salto immediato in modalita' sandbox.

### ✅ L'Avventura dell'Anello memorabile — TUTTA la roadmap implementata (luglio 2026)
Gli 8 punti della roadmap "memorabile", tutti in gioco:
1. **Incontri in viaggio** (`JourneyEvents`): dopo ogni tappa la strada puo' MORDERE — rischio
   d'agguato = base 8% + pericolo della regione (fino a +21%) + Fardello (fino a +20%); un **1
   al dado e' guai una volta su due**. I nemici sono QUELLI DEL POSTO (goblin e troll alle Soglie
   di Moria, Spettri nelle Paludi Morte, Uruk e Haradrim al Pelennor), spawn bilanciato sul
   party, e a scontro vinto la marcia riprende. Simulato: ~0,9 agguati a viaggio tipico.
2. **Il Fardello dell'Ombra** (`CompanySpirit`): la corruzione (0–100) cresce coi **Nazgul**
   (nemici "terrore": +6 a inizio scontro), nei **luoghi oscuri** (Moria, Cirith Ungol, Paludi,
   Morannon), nelle giornate storte (1 in marcia); cala nei **rifugi** (Brea, il Guado) e
   riposando. Ogni 25 punti le **prove del racconto perdono 1** e ogni punto **attira gli
   agguati** (+0,2%). La firma tematica LOTR, sempre visibile nel cruscotto.
3. **Speranza della Compagnia** (`CompanySpirit`): il morale (0–100, parte a 50) sale con le
   vittorie (+3, +5 sugli Spettri) e i rifugi, crolla coi compagni morenti (-3), caduti (-8) e
   col Terrore. A **70+ da' +1** alle prove e ai **tiri salvezza contro la morte**, a **25- li
   penalizza di 1**: si muore piu' facilmente quando non si spera piu' (55% → 60% / 50% di
   successo, verificato in simulazione). I 20 e gli 1 naturali restano naturali.
4. **Giorno/notte e accampamento**: ogni tappa o notte = **un giorno di cammino** (contatore nel
   cruscotto). Col pulsante **🏕 Accampati** (TravelPanel) cala la NOTTE sul Mondo cucito, si
   rischia l'**agguato notturno** (18% + pericolo + Fardello, **dimezzato se Grampasso veglia**),
   poi l'alba **cura tutto il party** e rinfranca lo spirito (+2 Speranza, -3 Fardello).
5. **Regioni vive** (`data/regioni_terra_di_mezzo.json`, 11 regioni + fallback): entrare in una
   regione la ANNUNCIA con un evento di colore suo (i tamburi di Moria, le fiammelle delle
   Paludi, i corni di Rohan), cambia l'**ambience** (vento/acqua/drone/tamburi) e nei domini
   dell'Ombra (pericolo 3) fa crescere il Fardello. Ogni etichetta della mappa risolve nella
   regione giusta (verificato).
6. **Grampasso, compagno PNG** (`CompanionManager`): il Ramingo commenta i momenti chiave
   (partenza, agguati, l'arrivo del Terrore, vittorie, arrivi, la veglia al campo) con battute
   brevi mai a raffica; in combattimento **si getta a stabilizzare un PG morente** (una volta
   per scontro); al campo la sua veglia **dimezza gli agguati notturni**. Solo in Terra di Mezzo.
7. **Diario di viaggio** (`TravelJournal` + pannello **📓 Diario**): le gesta si scrivono da sole
   giorno per giorno (partenze, agguati respinti coi nomi dei nemici, prime visite, cadute);
   le **etichette dei luoghi mai visitati sono attenuate** e si accendono alla prima visita;
   a racconto finito il diario compone il **riepilogo delle gesta** (giorni, scontri, luoghi).
   Persistenza per campagna.
8. **Reliquie: i Doni del Cammino** (`RelicsManager`): 7 reliquie (Lama del Ramingo, Amuleto del
   Viandante, Foglia di Lorien, Cotta di Mithril, Arco dei Galadhrim, Spada Ricomposta, Stella
   Serena) — **tutte ottenibili nella storia** (verificato). Set-bonus a soglie annunciate:
   **2 Doni = +1 prove, 4 = +1 tiri per colpire dei PG, 6 = +1 tiri salvezza**. Premia chi
   esplora i bivi invece di correre al finale.
Il tutto orchestrato dal cruscotto **Spirito della Compagnia** (giorno/Fardello/Speranza, in
alto a destra sul Mondo, solo Terra di Mezzo). Verifica: gdparse su tutti i 75 script, gdlint
pulito sui file nuovi (baseline invariata), simulazioni Python di spirito/agguati/reliquie e
validazione del JSON delle regioni (mostri/scene/pericoli/lookup).

### ✅ Mercanti e NPC con missioni sul Mondo cucito (luglio 2026)
- [x] **4 MERCANTI** (`data/mercanti_terra_di_mezzo.json` + `MerchantManager`): Bombadillo a
      Brea (pozioni, torce, lame oneste), Éogar ai Campi di Rohan (acciaio raro della Marca),
      Lindir al Guado di Bruinen (pozioni maggiori, arco epico, l'Amuleto del Viandante — un
      Dono del Cammino comprabile), Beregond al Pelennor (arsenale epico/leggendario di Minas
      Tirith). Marker **"M" dorato** accanto al luogo sulla mappa: click DA VICINO apre la
      bottega (da lontano il gioco suggerisce di viaggiarci col dado). Si paga con la **borsa
      comune** del party (`ProgressionManager.oro_totale/spendi_oro`: l'oro di bottini, storia
      e quest), l'oggetto finisce nello zaino vero (InventoryManager). Ogni listino/luogo/item
      VALIDATO contro i cataloghi.
- [x] **5 NPC con QUEST** (`data/quest_terra_di_mezzo.json` + `QuestManager`): l'oste di Brea
      (3 orchi di Isengard), lo scudiero di Rohan (3 selvaggi di Dunland), la sentinella elfica
      del Guado (raggiungi il Cancello Ovest di Moria), il capitano di Gondor (4 Uruk-hai), il
      pescatore del Nen Hithoel (2 Spettri della Palude). Marker **"!"** sul luogo (acceso se
      c'e' da accettare o riscuotere). Stati disponibile → attiva → completata → **riscossa
      dall'NPC** (ricompense VERE: oggetti + oro + XP via collect_loot/complete_quest). Le cacce
      avanzano DA SOLE in combattimento (contano i nemici giusti), le visite scattano all'arrivo
      nel luogo; ogni caccia e' REALIZZABILE (i bersagli compaiono negli agguati regionali e
      nella storia — verificato). Pannello **📜 Missioni** in toolbar (registro completo) e
      persistenza per campagna.

## PARTE 5 — Verso il GIOCO COMPLETO (roadmap)

Le fondamenta ci sono TUTTE: Master IA che narra e fa comparire i nemici, viaggio a dadi,
agguati regionali, spirito della Compagnia, mercanti e quest. Queste fasi chiudono il cerchio.

### ✅ Fase G1 — Il Master regista TOTALE dei token (luglio 2026)
Il Master narrava, evocava i nemici e spostava il party; ora dirige anche i SINGOLI gettoni
(`TokenDirector`, autoload):
- [x] **comando `moveToken` eseguito davvero**: {"command":"moveToken","target":"troll",
      "to":"verso Elrik|lontano|copertura|altura|<luogo>","cells":4}. Il target e' FUZZY
      (radice del nome senza vocale finale: 'orc' prende orco/orchi): un TIPO di nemico muove
      TUTTI i suoi token ("gli orchi"), un nome del party muove quel solo PG. I nemici si
      muovono via cella autorevole (CombatManager.set_combatant_cell: il gettone sul mondo
      segue da solo e le distanze di gioco restano allineate), i PG con la nuova planata
      singola `WorldTokens.muovi_verso` (nebbia, cella e salvataggio come un trascinamento).
- [x] **spostamenti NARRATI riconosciuti** (gemello di ChatTravelBridge per i token): se il
      Master SCRIVE "il troll carica", "gli orchi ripiegano", "gli arcieri salgono sulla
      cresta", "i selvaggi si nascondono", i token si muovono davvero — frase per frase,
      nome + verbo di movimento (5 categorie: carica/avanza/ritira/copertura/altura), max 4
      mosse a narrazione, MAI se il Master ha gia' dato il comando strutturato. VERIFICATO in
      simulazione: 8/8 frasi tipiche riconosciute, 0/5 falsi positivi su prosa neutra.
- [x] **destinazioni RELATIVE calcolate sulla mappa**: carica = adiacente al bersaglio; avanza
      = passo di 4 celle mai oltre l'adiacenza; ritirata = via dal fronte; copertura = la cella
      riparata piu' vicina (CoverManager.cella_copertura_vicina, entro 8 celle); altura = la
      cella dipinta piu' alta vicina (ElevationManager). Geometria verificata (adiacenza 1.00,
      la ritirata allontana, il passo non scavalca mai il bersaglio).
- [x] **`placeNpc`: nemici PIAZZATI senza scontro** — {"command":"placeNpc","id":"uruk-hai",
      "count":2} fa comparire i token sulla mappa SENZA avviare i turni (imboscate visibili,
      sentinelle da aggirare): la battaglia parte solo con startCombat. Niente auto-start e
      guardia aggiunta in ChatCombatBridge. Prompt del Master aggiornato con i due comandi.

### ✅ Fase G2 — La mappa che si TRASFORMA in battaglia (luglio 2026)
A inizio scontro il Mondo cucito DIVENTA la mappa tattica, senza cambiare vista
(`WorldBattleMode`, nodo del builder):
- [x] **transizione di regia** su combat_started: si calcola l'ARENA (il riquadro di tutti i
      combattenti + 4 celle di margine), la camera ci si STRINGE sopra (planata morbida della
      VTTCamera), tutto cio' che sta FUORI dall'arena cade in penombra (l'occhio va sullo
      scontro), l'ambience passa ai tamburi di battaglia. Se lo scontro DERIVA (fughe,
      inseguimenti) l'arena si allarga da sola a ogni cambio turno e la camera segue.
- [x] **griglia tattica locale**: dentro l'arena si accende una griglia dorata allineata alle
      celle di combattimento (1 cella = 128 px = 1,5 m) SENZA toccare la griglia globale
      dell'utente; bordo dorato attorno all'arena.
- [x] **evidenza tattica degli ostacoli**: bordo dorato sulle celle di COPERTURA (doppio bordo
      acceso per quella massiccia) e triangolo verde con la quota (+N) sulle ALTURE — si vede a
      colpo d'occhio dove ripararsi e dove salire.
- [x] **LINEA DI VISTA vera** (`CoverManager.linea_di_vista_libera` + gate in resolve_attack):
      un ostacolo MASSICCIO (copertura di livello 2) TRA arciere e bersaglio ora BLOCCA il tiro
      del tutto (Bresenham sulla griglia celle) — quello adiacente al bersaglio resta copertura
      (+CA), come sporgersi dall'angolo in BG3. Verificato in simulazione: un muro su OGNI cella
      interna del percorso blocca, in 10 direzioni; gli adiacenti agli estremi mai.
- [x] **anteprima del movimento**: trascinando un token in battaglia si vede il percorso
      tratteggiato e i METRI (1 cella = 1,5 m); per il PG ATTIVO il colore avvisa in ROSSO
      («oltre il passo!») quando superi i 9 m del turno meno i metri gia' spesi. (Il flag
      "provoca attacco di opportunita'" arriva con la G3, insieme alla regola.)
- [x] **a fine scontro tutto TORNA esplorazione**: penombra e griglia via, camera larga sul
      party, ambience della REGIONE (Terra di Mezzo) o automatica. Se il builder viene
      ricreato a scontro in corso la modalita' battaglia si riattiva da sola.

### ✅ Fase G3 — Regole di combattimento in stile BG3, COMPLETE (luglio 2026)
Gia' in gioco: azione/bonus/movimento, vantaggio/svantaggio, fiancheggiamento, altura, superfici,
copertura +2/+5, linea di vista, concentrazione, tiri contro la morte. Il set BG3 ora e' chiuso
(`TacticalRules`, autoload):
- [x] **attacchi di opportunita'** (reazione, una a round): chi ESCE dalla portata di mischia di
      un nemico senza Disimpegno subisce un attacco gratuito — agganciato DENTRO
      `set_combatant_cell`, quindi vale per TUTTI (trascinamento dei PG, IA nemica, regia del
      Master). Gli arcieri non li fanno (solo la mischia), gli spostamenti FORZATI (spinta) non
      provocano, il PG attivo spende la reazione dell'economia. Verificato: 6/6 casi (esce =
      provoca; Disimpegno/adiacente/non agganciato/arciere/reazione spesa = no).
- [x] **Disimpegno / Scatto / Schivata** come azioni complete, PG e IA: tre pulsanti nuovi
      nell'HUD (azione piena); il CODARDO si disimpegna prima di fuggire, il BERSERKER scatta
      se la carica non arriva a contatto, il GUARDIANO si mette in schivata mentre attende.
      La Schivata da' svantaggio a chi attacca (colpito: 60% -> 36%, simulato).
- [x] **movimento con le regole**: in combattimento un PG si trascina SOLO nel suo turno, entro
      il passo residuo (9 m, 18 con lo Scatto), mai da terra — fuori regola il token TORNA
      indietro con la spiegazione; l'anteprima avvisa in rosso PRIMA di sbagliare.
- [x] **salto** nel movimento: le superfici pericolose (fuoco, veleno) si SCAVALCANO con lo
      slancio — bruciano solo ATTERRANDOCI dentro (danno d'ingresso immediato), come in BG3.
- [x] **spinta alla BG3**: e' un'azione BONUS (non piena), richiede l'adiacenza, e se riesce
      SPOSTA il bersaglio di una cella via dall'attaccante; se la cella d'arrivo e' piu' BASSA
      c'e' il **danno da caduta** (1d6 per livello di quota perso — media 7 su 2 livelli).
- [x] **riposo breve** (stile BG3, pulsante ☕ nel pannello di viaggio): ogni PG ferito spende
      UN dado vita (dX + mod COS, mai meno di 1 PF) — i dadi sono finiti; il **riposo lungo**
      al campo ora ripristina anche TUTTI i dadi vita e gli SLOT incantesimo.
- [x] **ispirazione e vantaggio situazionale dal Master**: comandi {"command":"inspire"},
      {"command":"advantage"/"disadvantage","target":...} — vantaggio (o svantaggio) al
      PROSSIMO attacco di quel combattente, consumato all'uso e annunciato. Prompt aggiornato.

### ✅ Fase G4 — La mappa BELLA e strategica (luglio 2026)
- [x] **Tessere HQ della Terra di Mezzo** (`tools/genera_mappe_hq.py`): il mondo 3072x3072 e'
      generato IN UN COLPO SOLO (rumore frattale multi-ottava + domain warp, numpy) e poi
      diviso in 9 tessere — quindi le cuciture sono perfette PER COSTRUZIONE (salto ai bordi
      1.12 vs 1.06 interno: invisibile, misurato). Biomi ancorati alle regioni di gioco: Bosco
      Atro fitto e scuro, praterie DORATE di Rohan con ciuffi d'erba alta, lago Nen Hithoel e
      FIUME che scende al Guado fino alle Paludi (pozze nere e canneti), monti di Moria con
      nevai e hillshade da nord-ovest, Emyn Muil a creste, Pelennor a campi con chiazze di
      battaglia, Mordor di cenere con CREPE DI BRACE; piu' la Grande Via Est e la via del sud,
      il villaggio di Brea coi tetti rossi, il muro nero del Morannon e le guglie di Cirith
      Ungol. Etichette/regioni/coordinate INVARIATE (stesse dimensioni delle tessere).
- [x] **Props tematici per regione** (`tools/genera_props_lotr.py` + 6 PNG in assets/props:
      pino di Rohan, albero di Bosco Atro, rovina antica, guglia di Mordor, masso dell'Emyn,
      ceppo di palude) e **ARREDO FISSO del set** (assets/maps_terra_di_mezzo/arredo.json,
      37 pezzi): scenografia NON modificabile caricata da WorldProps, che conta come COPERTURA
      TATTICA — rovine e guglie sono livello 2: +5 CA e BLOCCANO la linea di vista (10 muri
      veri sparsi per il mondo). I 6 props entrano anche nella palette 🌳 per piazzarli a mano.
- [x] **Meteo di regione** (`WorldWeather`): PIOGGIA obliqua sulla Landa e sul Nen Hithoel,
      CENERE con braci ardenti nei domini di Mordor (Pelennor, Cirith Ungol, Morannon), banchi
      di NEBBIA su paludi, Moria, Bosco Atro ed Emyn Muil, sereno a Brea e a Rohan — campo
      "meteo" nel JSON delle regioni, cambio annunciato da JourneyEvents ("regione:cambiata"),
      particelle disegnate a mano nel riquadro camera (costo costante a ogni zoom). Sopra i
      token, sotto gli effetti di combattimento.
- [x] **Illuminazione degli scontri**: CERCHIO DI LUCE dorato (tre aloni concentrici) sotto il
      combattente di turno, che lo segue quando si muove — si vede a colpo d'occhio di chi e'
      il momento anche a camera larga. (Le frecce tracciate c'erano gia': WorldCombatFX.)

### ✅ Figure degli oggetti nell'inventario (luglio 2026)
- [x] **Non piu' solo il NOME**: ogni oggetto raccolto mostra la sua FIGURA. 37 icone generate
      (`tools/genera_icone_oggetti.py`, in assets/items): forma per categoria (spada, arco,
      pugnale, bastone, armatura, scudo, amuleto, pozione, focus, torcia, corda, razioni,
      arnesi) e colore per rarita' (comune grigio, rara azzurro, epica viola, leggendaria oro)
      con alone e gemma. Caricate da **`ItemArt`** (lettura raw, immune ai .import come i token).
- [x] **In gioco**: icona 40x40 accanto al nome nell'INVENTARIO (scheda personaggio) e nel
      LISTINO del mercante. Metti i tuoi PNG in `user://items/<id>.png` per sostituirle.

---

## PARTE 6 — Verso il gioco COMPLETO al 100% (roadmap dettagliata)

Il gioco e' gia' meccanicamente e strutturalmente solido (campagna completabile al 95% in
simulazione, regole BG3, mappa che si trasforma in battaglia, viaggio a dadi, mercanti, quest,
Fardello/Speranza, meteo). Ecco cosa resta per renderlo un prodotto rifinito al 100%, in ordine
di impatto. Ogni voce e' una sessione o poco piu'.

### 🎬 H1 — ANIMAZIONI: il gioco che si MUOVE ✅ FATTA
- [x] **Sprite animati dei combattenti**: ogni token ora RESPIRA in combattimento (bob
      sinusoidale con fase per-token, non all'unisono), fa un LAMPO BIANCO quando incassa un
      colpo (WorldTokens/WorldEnemyTokens su combatant_damaged) e, quando muore, non sparisce
      di colpo ma si DISSOLVE ruotando e stringendosi (~0.9s, lista `_morenti`) mentre la sua
      cella di gioco si libera SUBITO. I colpi CRITICI fanno tremare lo schermo
      (VTTCamera.scuoti — offset casuale con decadimento esponenziale, ~0.6s).
- [x] **Numeri di danno stilizzati**: i numeri volanti ora nascono GRANDI e si assestano
      (schiaffo d'impatto), salgono ad ARCO smorzato invece che lineare, DERIVANO di lato (due
      colpi ravvicinati non si impilano) e sfumano; i CRITICI piu' grandi e dorati ("CRIT! -N").
- [x] **Transizioni di pannello**: bottega, missioni, diario e viaggio entrano con uno
      SLIDE+FADE (helper unico `UiFx.entra`); il passaggio Esplorazione→Battaglia ha un IRIS
      d'apertura — la penombra attorno all'arena SALE in dissolvenza (~0.6s) invece di comparire
      di scatto.
- [x] **Pickup toast**: quando RACCOGLI un oggetto (bottino, acquisto, ricompensa di missione)
      un cartellino con la sua FIGURA + nome ("Hai ottenuto: …") sale e svanisce, bordato del
      colore della rarita' e impilabile (nuovo autoload `ToastUi`, evento "oggetto:raccolto").
- [x] **Dadi con impatto**: al risultato del 3D il numero fa un POP (nasce grande e rimbalza in
      scala) e cambia COLORE sul colpo di scena — ORO sul 20 naturale, ROSSO sull'1 naturale.

### 🔊 H2 — SUONI: il gioco che si SENTE ✅ FATTA
- [x] **SFX di combattimento per tipo d'arma**: 13 nuovi stinger sintetizzati
      (tools/genera_sfx_h2.py, zero licenze). Il colpo ora suona come l'ARMA e come il
      BERSAGLIO: twang dell'arco a distanza, lama (spada) vs botta contundente (mazza, per
      chierici/troll/ogre) in mischia, CLANK sull'armatura (CA≥15) vs l'impatto sulla carne,
      il crack del critico sopra tutto.
- [x] **SFX d'interfaccia** (nuovo autoload UiSfx): CLICK su ogni pulsante del gioco
      (agganciato in automatico via node_added, zero cablaggi), whoosh d'apertura dei pannelli
      (da UiFx), tintinnio d'ORO all'acquisto, FANFARA sul level-up, chime sull'oggetto raccolto.
- [x] **SFX degli eventi di viaggio** (nuovo autoload TravelSfx): PASSI a ogni tappa di marcia,
      TUONO entrando nelle regioni di pioggia, i TAMBURI di Moria, il CORNO su Rohan/Pelennor
      e all'arrivo a destinazione — tutto agganciato agli eventi esistenti.
- [x] **Musica adattiva** (nuovo autoload MusicDirector): tre TEMI sintetizzati all'avvio come
      il resto dell'audio procedurale — "esplorazione" (arpeggio pentatonico in RE minore su
      drone), "battaglia" (tamburi di guerra + motivo incalzante), "terrore" (droni che battono
      a 0.5 Hz, tritono che si gonfia, battito di cuore — parte da solo con Nazgul/Balrog/
      Re Stregone/spettri). Crossfade tra i temi, ducking sotto la voce del Master, loop senza
      cuciture (droni armonizzati + ricucitura coda-su-testa).
- [x] **Voce del Master piu' viva**: tre INTONAZIONI (narrazione calma / combattimento incalzante
      / terrore grave e lento) scelte da sole dal contesto (scontro attivo, ombre grandi nel
      testo); la voce ora RACCONTA anche il viaggio — l'ingresso nelle regioni (cupa nelle terre
      d'ombra) e gli agguati lungo la strada.

### ⚙️ H3 — MECCANICHE: completare il sistema di gioco 5e/BG3 ✅ FATTA
- [x] **Incantesimi veri** (nuovo autoload SpellBook + pulsante 📖 Magie nell'HUD): Dardo di
      Fuoco (attacco magico), Dardo Incantato (3 dardi infallibili), Cura Ferite (contatto, al
      PG piu' ferito — i morenti si rialzano), Parola Guaritrice (bonus, a distanza), FULMINE
      (4d6 a tutti sulla LINEA, TS DES dimezza) e RAGNATELA (area: TS FOR o afferrato) — con
      gli SLOT veri della scheda: si valida prima, si consuma poi (mai slot sprecati). CD e
      attacco magico dalla scheda (8+prof+INT il mago, SAG il chierico).
- [x] **Reazioni interattive** (nuovo autoload ReactionPrompt): quando un nemico attacca il
      mago, un PROMPT breve con conto alla rovescia chiede se lanciare SCUDO (+5 CA fino al
      suo turno, 1 slot L1 + la reazione) — l'IA nemica e' asincrona e ASPETTA la risposta.
      Il +5 entra nella CA di resolve_attack via TacticalRules.bonus_ca.
- [x] **Condizioni di stato complete**: spaventato (svantaggio ai suoi attacchi) e afferrato
      (niente movimento: drag bloccato, l'IA intrappolata prova a strapparsi con FOR CD 12)
      si aggiungono a prono/stordito/avvelenato; lo STORDITO ora salta davvero il turno (IA e
      pulsanti). BADGE colorati sopra ogni token (legenda unica in ConditionsManager.COLORI).
      I mostri le INFLIGGONO: i ragni avvelenano (TS COS 11), Nazgul/spettri/Re Stregone
      spaventano (TS SAG 12).
- [x] **Oggetti consumabili in battaglia** (pulsante 🧪 Oggetti nell'HUD): lancia la Fiasca
      d'Olio (2d4 fuoco + la cella resta in fiamme) o la Fiala d'Acido (2d6, TS DES dimezza),
      leggi la Pergamena del Fulmine (l'incantesimo SENZA slot, si consuma solo se il lancio
      parte). In vendita all'emporio di Brea, con le loro figure (icone generate).
- [x] **Abilita' di classe vere** (nuovo autoload ClassFeats + crescita al level-up): AZIONE
      IMPETUOSA del guerriero (1/scontro recupera l'azione), ATTACCO FURTIVO del ladro (+1d6
      quando colpisce con vantaggio), FURIA del barbaro (+2 danni in mischia, META' danni
      subiti, 3 round). Al level-up le classi crescono: il mago al 3° impara Fulmine+Ragnatela
      e apre uno slot L2, il chierico guadagna un L1 in piu'.

### 🧱 H4 — STRUTTURA: robustezza e longevita'
- [ ] **Salvataggi multipli con slot** e schermata di caricamento (oggi il progresso e' per
      campagna in user://, ma senza gestione di piu' partite/slot).
- [ ] **Schermo di morte e ripresa** curato (oltre al riprova della storia): un epilogo se il
      party cade davvero, con le gesta dal Diario.
- [ ] **Bilanciamento continuo**: il simulatore di partita completa (tools, Python) e' un test
      di regressione — rilanciarlo a ogni modifica del bestiario/storia per non reintrodurre muri.
- [ ] **Seconda campagna giocabile a fondo** (Ventimiglia ha i POI ma non un racconto ramificato
      come la Terra di Mezzo): darle il suo StoryDirector con boss e prove.
- [ ] **Tutorial/onboarding**: le prime schermate spiegano poco; un breve "primo scontro guidato"
      che introduce movimento, attacco, azioni bonus e viaggio a dadi.

### 🎨 H5 — RIFINITURA VISIVA
- [ ] **Ritratti veri di eroi e nemici** (i token attuali sono distintivi generati): render
      Blender o pacchetti CC0 in user://tokens — la pipeline fuzzy c'e' gia'.
- [ ] **Icone oggetti "dipinte"** che sostituiscano le forme generate (stessa cartella
      user://items, stessi id).
- [ ] **Font a tema fantasy** per titoli ed etichette (oggi il font di sistema).
- [ ] **Cursori e cornici** coerenti con l'estetica del Tavolo Oscuro.

### 🌐 H6 — (rimandato) Multiplayer e mondo condiviso
- [ ] **Multiplayer Supabase** e ruoli Master/giocatore — la rete (NetOutbox) e' predisposta.

---

## Come continuare lo sviluppo

Ogni sessione con Claude: chiedi una voce della Fase D/E/F, o incolla uno script di
`tools/blender/` in Claude Desktop (Blender MCP) per generare nuovi asset. Le mappe, i
token e i props che aggiungi in `user://` restano TUOI per sempre, aggiornamento dopo
aggiornamento.
