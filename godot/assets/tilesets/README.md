# assets/tilesets

Il Nexus Map Engine **non usa file di tileset su disco**: il `TileSet` è generato a runtime da
`map_manager.gd` (`_costruisci_tileset()`), un atlante colorato con 1 colonna per tipo di cella
(pavimento, muro, porta, acqua, lava, ponte, arco…). Stessa scelta di autosufficienza del resto del
progetto: niente asset esterni da scaricare, il gioco resta un unico pacchetto apribile subito.

Se in futuro vuoi tileset artistici veri (es. una tileset "cripta" disegnata a mano):
1. metti il PNG qui in `assets/tilesets/`;
2. crea una risorsa `.tres` `TileSet` che lo referenzia (o costruiscila da codice puntando a questa
   texture invece che a quella procedurale);
3. in `map_manager.gd` sostituisci `_costruisci_tileset()` con il caricamento del `.tres` — gli
   indici di colonna dei tipi di cella (`DungeonGenerator.PAVIMENTO`, `MURO`, ...) restano gli stessi.

Le mappe *disegnate* (es. una mappa salvata da Pinterest) si caricano invece già dalla mappa tattica
classica col pulsante **🖼 Sfondo mappa**, senza passare da qui.
