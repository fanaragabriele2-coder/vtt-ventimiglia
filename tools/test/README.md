# Test

Suite di verifica per i moduli core (1-17, gameplay single-player) e per il livello real-time
multiplayer (`js/18`-`js/22`, `server/relay.js`). **Zero dipendenze** per le suite node-only.

## Eseguire tutto

```
node tools/test/run-all.js
```

## Singole suite — moduli core (1-17)

| File | Cosa verifica | Dipendenze |
|------|---------------|------------|
| `core-state.js` | State manager PG (modulo 04): modificatori, saving throw, clamp HP/HP temporanei, Dadi Vita, serialize/hydrate | nessuna |
| `core-inventory.js` | Action economy + inventario (modulo 05, sopra il modulo 04 reale): risorse per turno, budget movimento, equip/CA, peso, consumabili | nessuna |
| `core-combat.js` | Combat tracker (modulo 06): d20 con vantaggio/svantaggio, parsing formule danno, raddoppio dadi sui critici, clamp HP combattenti | nessuna |
| `core-progression.js` | XP & loot (modulo 15): guadagno XP, salto di più livelli in un colpo solo, level-up (HP/competenza), `completeQuest` | nessuna |
| `core-backup.js` | Backup scaricabile (modulo 11): export su file (download), import da file (FileReader), round-trip ed errori senza eccezioni | nessuna |

## Singole suite — livello real-time multiplayer (18-22)

| File | Cosa verifica | Dipendenze |
|------|---------------|------------|
| `smoke.js` | Caricamento moduli 18/19/20, autorizzazione ruoli, rollback, coordinate, FSM, budget | nessuna |
| `sync.js` | Turni autorevoli inbound, hydration mid-game, interpolazione movimenti remoti | nessuna |
| `relay-e2e.js` | Handshake WebSocket, rifiuto eventi GM-only ai giocatori, broadcast/eco | nessuna |
| `relay-hardening.js` | `AUTH_TOKEN`, `GM_TOKEN` (declassamento), rate-limit, validazione payload | nessuna |
| `relay-resilience.js` | Conflitto di porta (`EADDRINUSE`) gestito senza crash; il relay resta operativo per gli altri client | nessuna |
| `game-events.js` | Routing di rete di HP/danni, nebbia, spawn nemici (GM-autorevoli, no eco) | nessuna |
| `mapping.js` | Mappatura esplicita token↔combattente: override, sync, hydration | nessuna |
| `panel-e2e.js` | Pannello di sessione nel browser reale: connessione, roster, ruoli, mappatura (2 client) | `playwright-core` + Chromium |

Le suite node-only usano stub minimali del browser/dei sottosistemi e caricano i moduli con `vm`
(spesso caricando i moduli REALI da cui dipendono, non stub, per testare l'integrazione vera),
oppure avviano il relay in-process / come sottoprocesso e ci collegano client WebSocket grezzi.

## Pannello E2E (browser, opzionale)

Richiede Playwright e un Chromium. In assenza, il test si **auto-salta** (exit 0).

```
npm i -D playwright-core         # una tantum
node tools/test/panel-e2e.js     # usa il Chromium di PLAYWRIGHT_BROWSERS_PATH o quello di playwright
```

## CI

Il workflow `.github/workflows/test.yml` esegue il syntax-check di tutti i moduli e
`node tools/test/run-all.js` a ogni push / pull request. Il pannello E2E si auto-salta in CI
(nessun browser installato): per eseguirlo serve un runner con Playwright.
