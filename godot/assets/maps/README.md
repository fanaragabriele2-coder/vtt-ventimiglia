# assets/maps — le battlemap del Mondo cucito (WorldBuilder)

Copia qui le tue battlemap **PNG/JPG** (quelle estratte dai pacchetti che possiedi). Alla
prossima apertura della vista **🧩 Mondo cucito**, il `WorldBuilder`:

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
un giorno esporti l'eseguibile, includi `*.png,*.jpg` nei filtri di export non-risorsa.
