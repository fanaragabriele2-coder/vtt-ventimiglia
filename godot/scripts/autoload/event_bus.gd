extends Node
## EventBus (Autoload singleton) — canale di signal TIPIZZATI del Nexus Map Engine.
##
## Comunicazione disaccoppiata fra Mappa, UI e Combat Tracker: chi genera un dungeon non conosce
## i pannelli che lo mostrano, chi spawna un token non conosce la mappa che lo disegna. NOTA di
## architettura: il progetto ha GIA' un bus per gli eventi di gioco legacy (GameState.publish /
## event_published / announce, porting del monolite JS) — quello resta la via per gli eventi di
## partita (chat, level-up, bottino...). QUESTO bus e' il livello di disaccoppiamento del dominio
## NUOVO (il motore mappa Nexus): tenerli separati evita che il traffico di mappa passi da un
## dizionario non tipizzato quando puo' avere firme forti.
##
## Registrazione: Project Settings > Autoload -> "EventBus" (PRIMO: non dipende da nessuno).

## Un dungeon e' stato generato dal MapManager (tema + dati completi del generatore).
signal dungeon_generated(tema: String, dati: Dictionary)
## Il party si e' mosso su una cella del dungeon Nexus.
signal nexus_party_moved(cell: Vector2i)
## L'utente ha cliccato una cella del dungeon (anche non percorribile: la UI puo' reagire).
signal nexus_cell_clicked(cell: Vector2i)
## Qualcuno (Master IA, UI) chiede di far comparire un mostro su una cella del dungeon.
signal nexus_spawn_requested(monster_id: String, cell: Vector2i)
## Un token nemico e' stato piazzato sul dungeon (gia' registrato anche nel CombatManager).
signal nexus_token_spawned(combatant_id: String, cell: Vector2i)
