# Test — livello real-time (Fasi 1-3 + hardening)

Suite di verifica per i moduli di sincronizzazione multiplayer (`js/18`, `js/19`, `js/20`,
`js/21`) e per il relay (`server/relay.js`). **Zero dipendenze** per le suite node-only.

## Eseguire tutto

```
node tools/test/run-all.js
```

## Singole suite

| File | Cosa verifica | Dipendenze |
|------|---------------|------------|
| `smoke.js` | Caricamento moduli 18/19/20, autorizzazione ruoli, rollback, coordinate, FSM, budget | nessuna |
| `sync.js` | Turni autorevoli inbound (#1), hydration mid-game (#2), interpolazione movimenti remoti (#5) | nessuna |
| `relay-e2e.js` | Handshake WebSocket, rifiuto eventi GM-only ai giocatori, broadcast/eco | nessuna |
| `relay-hardening.js` | `AUTH_TOKEN`, `GM_TOKEN` (declassamento), rate-limit, validazione payload | nessuna |
| `panel-e2e.js` | Pannello di sessione nel browser reale: connessione, roster, ruoli (2 client) | `playwright-core` + Chromium |

Le suite node-only usano stub minimali del browser/dei sottosistemi e caricano i moduli con `vm`,
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
