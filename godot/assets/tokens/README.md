# I TUOI token dipinti — come usarli nel gioco

**La via rapida (NIENTE rinomine):** in gioco premi **"📥 Importa token"** nella toolbar,
seleziona TUTTI i file della tua cartella (es. `Desktop\nemi`) e conferma. Il gioco li copia
in `user://tokens` e li aggancia da solo ai mostri col **match fuzzy sul nome file**:
"Goblin di Moria - Guerriero CR 1-4.png" diventa il token di *Goblin di Moria*,
"Nazgul Khamûl - CR9.png" quello di *Khamûl*, "Trolls Cavernone.png" quello del *Troll delle
Caverne* (singolari/plurali e suffissi combaciano; gli accenti non contano).

Il gioco carica l'arte dei token con questa PRIORITA':

1. **`user://tokens/<id>.png`** — nome ESATTO: vince su tutto (usalo per forzare un
   abbinamento che il fuzzy sbaglia o non trova).
2. **`user://tokens/<qualunque nome>`** — match fuzzy sul nome file (vedi sopra); a parita'
   vince il nome file piu' corto.
3. `res://assets/tokens/<id>.png` — i distintivi inclusi (segnaposto).
4. cerchio colorato con l'iniziale (fallback).

PNG/JPG/WebP quadrati, idealmente 256x256 o piu'. I file stanno FUORI dal progetto e
sopravvivono agli aggiornamenti. La tabella qui sotto serve per i nomi ESATTI del punto 1.

> Dove sta `user://tokens`? Il pulsante **"🎭 Cartella token"** la apre direttamente; su
> Windows di solito e' `%APPDATA%\Godot\app_userdata\<nome progetto>\tokens`.

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
