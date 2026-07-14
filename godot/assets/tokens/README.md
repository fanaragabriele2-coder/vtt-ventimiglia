# I TUOI token dipinti — come usarli nel gioco

Il gioco carica l'arte dei token con questa PRIORITA':

1. **`user://tokens/<id>.png`** — i TUOI file (fuori dal progetto, sopravvivono agli
   aggiornamenti). **Vincono su tutto.**
2. `res://assets/tokens/<id>.png` — i distintivi inclusi (segnaposto).
3. cerchio colorato con l'iniziale (fallback).

Quindi: prendi i ritratti della tua **Asset Library** (la libreria del Signore degli
Anelli / NPC & Mercanti), rinominali ESATTAMENTE come nella tabella qui sotto (PNG
quadrati, idealmente 256x256 o piu', con sfondo trasparente) e mettili nella cartella
`user://tokens`. Al riavvio (o cambiando scontro) compaiono IDENTICI sulla mappa —
nessuna modifica al codice.

> Dove sta `user://tokens`? Su Windows di solito:
> `%APPDATA%\Godot\app_userdata\<nome progetto>\tokens`.
> In alternativa, se giochi dall'editor, la trovi anche via `res://` accanto a questa.

## Bestiario — nome nel gioco → file da creare

| Nome mostro | File da mettere in `user://tokens/` |
|---|---|
| Goblin | `goblin.png` |
| Bandito | `bandit.png` |
| Scheletro | `skeleton.png` |
| Lupo | `wolf.png` |
| Orco | `orc.png` |
| Cultista | `cultist.png` |
| Zombie | `zombie.png` |
| Hobgoblin | `hobgoblin.png` |
| Goblin di Moria | `goblin-moria.png` |
| Uomo Selvaggio di Dunland | `uomo-selvaggio.png` |
| Orco di Isengard | `orco-isengard.png` |
| Corsaro di Umbar | `corsaro-umbar.png` |
| Uruk-hai | `uruk-hai.png` |
| Arciere Haradrim | `arciere-haradrim.png` |
| Capitano Uruk-hai | `capitano-uruk-hai.png` |
| Spettro della Palude | `spettro-palude.png` |
| Troll delle Caverne | `troll-caverne.png` |
| Grima Vermilinguo | `grima-vermilinguo.png` |
| Guardiano nell'Acqua | `guardiano-acqua.png` |
| Khamûl lo Stregone Orientale | `nazgul-khamul.png` |
| Akhorahil | `nazgul-akhorahil.png` |
| Ren lo Sconvolto | `nazgul-ren.png` |
| Adûnaphel la Silente | `nazgul-adunaphel.png` |
| Uvatha il Cavaliere | `nazgul-uvatha.png` |
| Hoarmurath di Dir | `nazgul-hoarmurath.png` |
| Dwar di Waw | `nazgul-dwar.png` |
| Ji Indur Sventamorte | `nazgul-ji-indur.png` |
| Saruman il Bianco | `saruman-bianco.png` |
| La Bocca di Sauron | `bocca-di-sauron.png` |
| Il Re Stregone di Angmar | `re-stregoni-angmar.png` |
| Drago delle Montagne Grigie | `drago-montagne-grigie.png` |
| Shelob | `shelob.png` |
| Balrog di Morgoth | `balrog.png` |

## Party / classi degli eroi

| Classe | File |
|---|---|
| Guerriero | `guerriero.png` |
| Barbaro | `barbaro.png` |
| Ladro | `ladro.png` |
| Ranger | `ranger.png` |
| Mago | `mago.png` |
| Chierico | `chierico.png` |

Puoi anche dare a un SINGOLO eroe il suo ritratto: `user://tokens/<nome del
personaggio>.png` (es. `Brunilde.png`) vince sull'arte di classe.
