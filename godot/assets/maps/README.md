# assets/maps — le battlemap del Mondo cucito (WorldBuilder)

⚠️ **Questa cartella NON è più il posto consigliato per le tue mappe.** Ogni volta che il
progetto viene aggiornato (un nuovo zip, un `git pull`...), questa cartella fa parte del
repository e può essere sovrascritta — le immagini che avevi messo qui **rischiano di
sparire** al prossimo aggiornamento.

## Il modo più semplice: TRASCINA le immagini sulla finestra del gioco

Apri la vista **🧩 Mondo cucito** e **trascina i file immagine (PNG/JPG/WebP) direttamente
sulla finestra del gioco** (da Esplora File, dal Desktop, da dove vuoi): vengono copiati
automaticamente in `user://maps` e il mondo si ricostruisce da solo. Niente cartelle da
cercare, niente percorsi da digitare, niente riavvii.

## In alternativa: la cartella `user://maps`

Nella stessa vista, **📁 Apri cartella mappe** apre direttamente la cartella giusta nel file
manager del sistema (Esplora File su Windows). Quella cartella (`user://maps`, fuori dal
progetto, nella cartella dati dell'utente del sistema operativo) **non viene mai toccata**
dagli aggiornamenti del gioco: le mappe che ci metti restano per sempre.

Dopo aver aggiunto o tolto immagini a mano, premi **🔄 Ricarica mappe** nella stessa vista
(non serve riavviare il gioco). **🗺 Inquadra tutto** riporta la camera a vedere l'intero
mondo dopo che hai zoomato ed esplorato.

Il `WorldBuilder` cerca PRIMA in `user://maps`; se è vuota, ripiega su questa cartella
(`res://assets/maps`) — quindi questa cartella del repository resta utile solo per chi
preferisce versionare le mappe insieme al codice (sapendo il rischio di cui sopra).

## Cosa fa il Mondo cucito con le tue mappe

1. le cuce in una **griglia perfetta** (ordine alfabetico, riga per riga; se i formati
   differiscono, i chunk vengono riscalati alla cella comune — zero buchi);
2. applica la **coerenza visiva**: micro color-grading per allineare neri e mezzitoni dei
   pacchetti diversi + fusione dei bordi verso un tono neutro comune + tinta globale
   giorno/tramonto/notte/dungeon;
3. attiva il **culling VRAM**: i chunk fuori vista si nascondono, quelli molto lontani
   scaricano proprio la texture dalla memoria video (si ricarica al ritorno della camera).

Consigli pratici:
- usa nomi ordinabili (`mappa_01.png`, `mappa_02.png`, …) per controllare la disposizione:
  la griglia è riga-per-riga in ordine alfabetico, con ~√N colonne;
- formati uniformi = risultato migliore (il riscalo alla cella comune copre le differenze,
  ma nasce per piccoli scarti, non per mischiare 512px con 8K);
- le immagini restano TUE e locali: niente viene scaricato né inviato da nessuna parte.

Nota export: il gioco legge questi file come file grezzi — dall'editor funziona subito; se
un giorno esporti l'eseguibile, includi `*.png,*.jpg` nei filtri di export non-risorsa
(non serve per `user://maps`, che esiste sempre a runtime).

## Se una mappa non si carica (schermo nero / vista vuota)

La vista te lo dice ora in chat, col nome del file. La causa più comune è il **formato
colore**: Godot legge JPG/PNG solo in **RGB**, non in **CMYK** (molti pacchetti di mappe
venduti come stock art escono da Adobe in CMYK). Se un file fallisce:

1. aprilo con un editor immagini (anche Paint/Anteprima/GIMP) e **risalvalo** — la maggior
   parte dei programmi lo converte automaticamente in RGB in fase di export;
2. verifica che l'estensione corrisponda davvero al contenuto (un file `.png` che in realtà
   è un altro formato non si carica);
3. controlla che il file non sia corrotto (si apre normalmente fuori da Godot?).
