# Nexus Map Engine — Architettura v2 (design document)

> Documento di design, non codice. La **v1** del motore è già nel repository (`scripts/map/`):
> generatore BSP/automata, 4 `TileMapLayer`, luci + occluder, EventBus, integrazione col
> CombatManager. Questo documento definisce l'evoluzione: ✅ = già implementato, 🔧 = progettato.

## 1. Sistema TileMap Multi-Layer (un nodo, una responsabilità)

```
NexusMapManager (Node2D · y_sort_enabled = true)
├── Ground        TileMapLayer  z=0  pavimenti + fluidi (base)            ✅
├── GroundDetail  TileMapLayer  z=0  decal: crepe, tappeti, ossa          🔧
├── Walls         TileMapLayer  z=1  muri "alti" 2.5D + occluder          ✅ (muri alti 🔧)
├── Props         TileMapLayer  z=2  y_sort: pilastri, tavoli, casse      ✅
├── Tokens        Node2D        z=2  y_sort: PG/PNG — FRATELLO di Props   ✅
├── Overhead      TileMapLayer  z=4  archi, passerelle, fronde            ✅
├── Roofs[k]      TileMapLayer  z=5  UN layer per stanza (tetti a scomparsa) 🔧
├── Lights        Node2D             torce/lava/vista del party           ✅
├── FogLayer      Sprite2D+shader    nebbia a doppio canale               🔧
├── CanvasModulate                   tinta d'ambiente per tema            ✅
└── Camera2D                         pan/zoom                             ✅
```

Punti tecnici chiave:

1. **Y-sort attraverso layer diversi.** Il Y-sort di Godot 4 attraversa i nodi solo se il PADRE
   e' y-sorted e i fratelli coinvolti pure, con lo stesso `z_index`. `Props` (TileMapLayer) e
   `Tokens` (Node2D) devono essere FRATELLI y-sorted sotto un padre y-sorted: un token dietro un
   pilastro viene coperto, davanti lo copre. Su z diversi il Y-sort non scatta mai.
2. **`y_sort_origin` per-tile.** I props alti (pilastro 32x64) si ordinano per il PIEDE:
   `TileData.y_sort_origin` alla base, o il 2.5D "sfarfalla" al passaggio dei token.
3. **Muri alti stile Crosshead.** Tile 32x64 con `texture_origin` offsettato: la cella LOGICA
   resta (x,y), il disegno sale di una cella. La griglia di gioco ignora l'altezza visiva.
4. **Tetti a scomparsa.** Il fading e' per-layer, non per-cella → un mini-TileMapLayer di tetto
   PER STANZA (il BSP conosce gia' le stanze come `Array[Rect2i]`). Party entra nella stanza k →
   `Tween` su `modulate.a` del layer k (0.25s). ~20 layer piccoli: costo irrisorio.
5. **Multi-livello (roccaforte nanica).** Ogni piano = un "LevelStack" (l'intero blocco di layer)
   figlio del manager. Attivo = visibile; piano sotto in `modulate` scuro (contesto); piani sopra
   nascosti. Scale = celle con custom-data `stairs_to`. Input/logica su UN livello alla volta.

## 2. Illuminazione + Fog of War (doppio canale)

Regola d'oro dei VTT: **"vedo ora" ≠ "ho esplorato"**.

### Canale A — Line of Sight adesso (lo fa il renderer) ✅ base in repo
- `CanvasModulate` quasi-nero, tinto per tema (cripta blu-fredda, tempio ambra).
- `PointLight2D` con `shadow_enabled` sul token del party = cono di visione; torce/lava = ambiente.
- Occluder: oggi un `LightOccluder2D` per cella-muro ✅; evoluzione 🔧: poligono di occlusione
  DENTRO il TileSet (occlusion layer per-tile) → ogni cella di muro dipinta porta l'occluder
  gratis, zero nodi; per mappe enormi, merge dei muri contigui in polilinee.
- Il raycasting della luce lo fa il renderer per-pixel con penombre morbide: mai su CPU.

### Canale B — Memoria dell'esplorato (griglia, Lague-style) 🔧
- Al CAMBIO DI CELLA del party (event-driven, mai per frame): shadowcasting ricorsivo sulla
  griglia logica — o raggi di Bresenham verso il perimetro del cerchio di visione (identico su
  raggio ≤ 12). Output: set di celle visibili. `visibile ∪ esplorato` → `PackedByteArray`.
- Resa: una `ImageTexture` w×h dove 1 PIXEL = 1 CELLA (R=esplorato, G=visibile, B=autoilluminato),
  campionata da uno shader canvas su un quad grande quanto la mappa: il filtering lineare in
  upscale produce bordi di nebbia morbidi gratis. Aggiornare la fog = riscrivere un'immagine 48x36.
- **Stanze segrete:** celle con `region_id` segreto = opache per lo shadowcasting E mascherate a
  nero pieno nello shader, finche' GameState non alza `reveal:region_k` (leva trovata, o comando
  `<<DATI>>` del Master IA) → dissolvenza via uniform.
- **Fiumi di lava:** (a) dentro la LOS: `PointLight2D` campionate lungo il fiume + shader sul tile
  (noise scorrevole + pulsazione `sin(TIME)`); (b) FUORI dalla LOS: la lava scrive il canale
  "autoilluminato" della fog texture → oltre la nebbia un bagliore rosso diffuso. Senti il fiume
  prima di vederlo.
- **Pathfinding:** `AStarGrid2D` nativa, ricostruita a fine generazione dalla maschera di
  percorribilita'; diagonali on; pesi per terreno (acqua 2.0, macerie 1.5). Il click-to-move segue
  il percorso; `lunghezza_path × 1,5 m` = costo per l'Action Economy esistente.

## 3. Data Structure (single source of truth)

Regola assoluta: **il TileMapLayer non e' mai autorevole** — e' il materializzatore visivo.

```
MapData (Resource)                          ← evoluzione del Dictionary gia' in repo
├── larghezza, altezza: int                 ✅
├── tema: String · seme: int                ✅ rigenerazione deterministica al bit
├── ground/muri/props/overhead: PackedInt32Array   ✅ (w×h, indice = y*w+x)
├── region_id: PackedInt32Array             🔧 stanza di appartenenza + stanze segrete
├── stanze: Array[Rect2i] · torce · spawn   ✅
└── DERIVATI (ricostruiti, mai salvati):
    ├── collision_mask: PackedByteArray     ✅ (oggi come cella_percorribile())
    ├── astar: AStarGrid2D                  🔧
    └── fog esplorata: PackedByteArray      🔧 (QUESTA si salva)
```

- **Perche' i token non attraversano i muri:** niente fisica, verita' logica. La collision_mask si
  deriva una volta da ground+muri+props e TUTTI gli attori passano dallo stesso cancello
  `validate_move(da, a)`: click del giocatore, IA nemica, comandi del Master via AI bridge. Un
  muro non si attraversa perche' nessun percorso A* lo attraversa. Gli spawn dell'IA passano da
  `nearest_walkable(cella)` (gia' cosi' in repo ✅).
- **Salvataggio — "salva il seme, non il mondo":** (tema, seme) rigenera la mappa identica → il
  SaveManager persiste solo tema+seme, fog esplorata (RLE), porte aperte, token vivi. Un intero
  dungeon in poche centinaia di byte.
- **Rete — sincronizzare mappe pesanti senza trasmetterle mai:** 🔧
  1. `{type:"map", tema, seme}` → ogni client rigenera localmente (generatore deterministico ✅);
  2. poi solo eventi-delta da 20-40 byte: `{move,id,da,a}`, `{spawn,id,cella}`, `{reveal,region}`;
  3. host-authoritative: l'host valida ogni move contro la SUA collision_mask prima del broadcast;
     numeri di sequenza per l'ordine; eventi idempotenti (ri-applicarli non corrompe).
  Trasporto: `WebSocketPeer` verso lo stesso relay/Supabase gia' previsto dal Net Outbox del
  monolite JS (Task 2): il canale e' gia' disegnato, si riusa.

## Roadmap di costruzione (ogni fase giocabile da sola)

| Fase | Contenuto | Stato |
|---|---|---|
| **1b** | VTTCamera dedicata (pan/zoom smorzati, zoom-to-cursor, limiti mappa) | ✅ |
| **2** | Occluder nel TileSet + fog a doppio canale con shader + AStarGrid2D + `valida_movimento` unico | ✅ |
| **3** | Tetti a scomparsa per stanza + muri alti + multi-livello + `MapData` Resource + save seme+delta | 🔧 |
| **4** | Rete seed-sync host-authoritative su WebSocket/Supabase | 🔧 |
