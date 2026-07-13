# Esportare il gioco come .exe per Windows (giocare senza l'editor)

Il progetto include già un **preset di export** pronto (`export_presets.cfg`): produce un
eseguibile Windows a doppio click, con tutte le mappe, i token, i props e i dati dentro.

## La prima volta: scarica i "template di export"

Godot ha bisogno dei template di export della TUA versione (una volta sola, poi valgono per
sempre):

1. Apri il progetto in Godot;
2. menu **Editor → Gestisci modelli di esportazione…** (*Manage Export Templates…*);
3. clicca **Scarica e installa** (*Download and Install*) — Godot prende i template giusti
   per la sua versione dal sito ufficiale;
4. attendi il "Fatto".

## Esportare

1. Menu **Progetto → Esporta…** (*Project → Export…*);
2. nella lista è già presente il preset **"Windows Desktop"**;
3. (facoltativo) imposta un'icona `.ico` nel campo *Application → Icon*;
4. clicca **Esporta progetto** (*Export Project*);
5. la destinazione predefinita è `dist/VentimigliaVTT.exe` (accanto alla cartella `godot`);
   conferma o scegline un'altra.

Fatto: `VentimigliaVTT.exe` si avvia con un doppio click, senza Godot.

## Cosa viene incluso (e cosa no)

Il preset include già i formati giusti come risorse non-script:
`*.png, *.jpg, *.jpeg, *.webp, *.json, *.gdshader`. Esclude `tools/` (gli script Blender, che
servono a te, non al gioco) e i `*.md`.

⚠️ **Le cartelle `user://`** (mappe, token, props e salvataggi che aggiungi TU giocando) NON
finiscono nell'exe — ed è giusto così: restano sul disco dell'utente e sopravvivono a ogni
nuova build. L'exe esce con gli asset INCLUSI nel progetto (le 9 mappe, i 14 token, gli 8
props); tutto ciò che aggiungi in `user://` continua a funzionare identico anche nell'exe.

## Distribuire ad altri

Basta il singolo file `VentimigliaVTT.exe` (il `.pck` è incorporato, `embed_pck=true`). Chi lo
riceve non ha bisogno di Godot. Se usi un'icona personalizzata, quella viene incorporata
nell'eseguibile.
