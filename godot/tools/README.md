# tools — pipeline Blender → Godot

## Stato reale (leggere prima di tutto)

- Questo progetto oggi è **2D** (tileset procedurali, `Control`/`Node2D`): **non contiene asset 3D**.
  Questa pipeline è pronta per quando ne aggiungerai.
- **Godot MCP e Blender MCP girano sul TUO PC**, non nel cloud: servono Blender e l'editor Godot
  aperti in locale, collegati a Claude Desktop / Claude Code. Da una sessione cloud non sono
  raggiungibili. Setup locale (una volta sola):
  1. Blender MCP: installa l'addon "blender-mcp" in Blender e registra il server in
     `claude mcp add blender ...` (segui il README del progetto blender-mcp).
  2. Godot MCP: scarica un server "godot-mcp", registralo con `claude mcp add godot ...` e tieni
     l'editor Godot aperto sul progetto.
  3. Apri Claude Code sul TUO PC dentro questa repo: a quel punto i tool `mcp__blender__*` e
     `mcp__godot__*` compaiono e la pipeline si può pilotare davvero.

## Convenzioni di naming

| Suffisso  | Significato                                            | Va nel runtime? |
|-----------|--------------------------------------------------------|-----------------|
| `*_HP`    | High poly sorgente (scultura, CAD, scan)               | MAI             |
| `*_LP`    | Low poly game-ready: UV pulite, trasformazioni applicate | Sì (via export) |
| `*_CAGE`  | Gabbia per il bake selected-to-active (opzionale)      | MAI             |
| `*_EXPORT`| Copia temporanea pre-export (se serve)                 | Solo come GLB   |

Gli originali **non si cancellano mai**: l'HP resta nel `.blend` in `art/blender/`.

## Budget triangoli (target per ruolo)

| Ruolo        | Target tris   | Esempio                          |
|--------------|---------------|----------------------------------|
| Hero asset   | 15k – 40k     | statua della cripta, boss        |
| Medium prop  | 3k – 10k      | tavolo, sarcofago, colonna       |
| Filler       | < 2k          | detriti, ossa, ciotole           |

Un asset da ~2M poligoni NON entra mai nel runtime: si conserva come `_HP`, si crea l'`_LP` al
target del ruolo e il dettaglio si trasferisce con `hp_to_lp_bake.py` (normal/AO/albedo).

## Baking: hp_to_lp_bake.py

Headless, dal terminale del PC con Blender:

```
blender -b art/blender/statua.blend --python godot/tools/hp_to_lp_bake.py -- \
  --hp Statua_HP --lp Statua_LP --out ./godot/art/textures --asset statua \
  --res 2048 --margin 16 --maps basecolor,normal,ao,roughness,metallic \
  --cage Statua_CAGE --smoothness --pack-orm
```

- Valida presenza oggetti e UV del LP (fallisce con messaggio chiaro, non a metà bake).
- `selected-to-active` + cage/extrusion; metallic bakato via EMIT (ricablaggio temporaneo, poi
  ripristinato); `--smoothness` = roughness invertita; `--pack-orm` = R:AO / G:Roughness /
  B:Metallic (convenzione glTF, la stessa che Godot legge nativamente).
- Naming output: `<asset>_<mappa>.png` in `art/textures/`.
- Lo script è verificato a livello di sintassi; il primo bake reale fallo su un asset piccolo.

## Export per Godot (checklist)

1. Applica trasformazioni al LP (Ctrl+A: rotazione+scala; scala = 1.0, pivot alla base).
2. Esporta **glTF Binary (.glb)** in `art/exports/` — solo il LP, mai HP/CAGE
   (usa "Selected Objects" nell'export).
3. In Godot l'import è automatico; per gli asset principali crea una scena riusabile
   (`scenes/props/<asset>.tscn`) con `StaticBody3D` + collisione SEMPLICE
   (Box/ConvexPolygonShape3D, non trimesh, salvo pavimenti).
4. Materiale: `StandardMaterial3D` con basecolor (sRGB) + normal + ORM (Non-Color).

## Mappa cartelle

- `art/source/`   → sorgenti grezzi (scan, foto, riferimenti)
- `art/blender/`  → i `.blend` (contengono HP+LP+CAGE)
- `art/exports/`  → i `.glb` runtime-ready (SOLO questi entrano nelle scene)
- `art/textures/` → output del bake
- `assets/tilesets/` → (2D) vedi il suo README: i tile del Nexus sono procedurali
