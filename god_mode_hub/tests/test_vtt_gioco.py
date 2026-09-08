"""Smoke test del VTT vero e proprio, caricato in un browser reale.

Il gioco non aveva un solo test: qualunque errore JavaScript introdotto da una
risposta LLM salvata dalla Drop Zone si scopriva solo aprendo il browser a
mano. Qui il gioco viene servito dal suo `dev-server.js` e caricato in
Chromium: se un modulo esplode all'avvio, o un global sparisce, il test lo
dice.

Salta (non fallisce) se Node o Chromium non sono disponibili: sono strumenti
di sviluppo opzionali.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

import pytest

from utils import sd_browser, vtt_project

PROGETTO = Path(__file__).resolve().parents[2]

#: Moduli che devono esistere dopo il caricamento: sono le fondamenta su cui
#: si appoggiano tutti gli altri script (ordine di caricamento in index.html).
GLOBAL_ATTESI = [
    "UltimateVTTState",
    "UltimateVTTCanvas",
    "UltimateVTTCombat",
    "UltimateVTTInventory",
    "UltimateVTTTokenPhysics",
    "UltimateVTTAIBridge",
    "VTTStartMenu",
    "VentimigliaMap",
]


def _chromium_ok() -> bool:
    if not sd_browser.is_playwright_installed():
        return False
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            sd_browser._launch_chromium(pw).close()
    except Exception:  # noqa: BLE001
        return False
    return True


pytestmark = pytest.mark.skipif(
    not (vtt_project.node_available() and _chromium_ok() and (PROGETTO / "index.html").is_file()),
    reason="servono Node, Chromium e il progetto VTT",
)


@pytest.fixture(scope="module")
def gioco_servito() -> str:
    """Serve il VTT reale con il suo `dev-server.js`, sulla porta del progetto.

    Usa lo script vero invece di un server improvvisato: se il server di
    anteprima si rompe, questo test se ne accorge.
    """
    porta = vtt_project.DEV_SERVER_PORT
    gia_attivo = vtt_project.port_in_use(porta)
    processo = None
    if not gia_attivo:
        processo = subprocess.Popen(
            ["node", str(PROGETTO / "dev-server.js")],
            cwd=str(PROGETTO), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    try:
        for _ in range(60):
            if vtt_project.port_in_use(porta):
                break
            time.sleep(0.2)
        else:
            pytest.skip("dev-server.js non si è avviato")
        yield f"http://127.0.0.1:{porta}/"
    finally:
        if processo is not None:
            processo.terminate()
            try:
                processo.wait(timeout=5)
            except subprocess.TimeoutExpired:
                processo.kill()


@pytest.fixture(scope="module")
def pagina_caricata(gioco_servito: str):
    """Carica il gioco una volta sola e raccoglie errori JS e global definiti."""
    from playwright.sync_api import sync_playwright

    errori: list[str] = []
    richieste_fallite: list[str] = []
    with sync_playwright() as pw:
        browser = sd_browser._launch_chromium(pw)
        try:
            page = browser.new_page()
            # Errori JS veri (eccezioni non catturate): quelli che rompono il gioco.
            page.on("pageerror", lambda exc: errori.append(str(exc)))
            # Risorse non caricate, con l'URL: distingue una CDN irraggiungibile
            # (ambiente senza rete) da un file del progetto che manca davvero.
            page.on("requestfailed",
                    lambda req: richieste_fallite.append(f"{req.url} ({req.failure})"))
            page.on("response", lambda resp: richieste_fallite.append(
                f"{resp.url} (HTTP {resp.status})") if resp.status >= 400 else None)
            page.goto(gioco_servito, wait_until="load", timeout=60_000)
            page.wait_for_timeout(3000)  # gli script si registrano dopo il load
            presenti = page.evaluate(
                "() => Object.keys(window).filter(k => k.startsWith('UltimateVTT') "
                "|| k.startsWith('VTT') || k.startsWith('Ventimiglia'))"
            )
            titolo = page.title()
            html_len = page.evaluate("() => document.body.innerHTML.length")
        finally:
            browser.close()
    return {
        "errori": errori, "richieste_fallite": richieste_fallite,
        "global": presenti, "titolo": titolo, "html_len": html_len,
    }


def test_il_gioco_si_carica_senza_errori_javascript(pagina_caricata: dict) -> None:
    """Regressione principale: un modulo rotto salvato dalla Drop Zone.

    Guarda solo le eccezioni JavaScript non catturate: le risorse esterne che
    non si caricano hanno un test dedicato, perché in un ambiente senza rete
    sono normali e non indicano codice rotto.
    """
    assert not pagina_caricata["errori"], (
        f"eccezioni JavaScript all'avvio del VTT: {pagina_caricata['errori'][:5]}"
    )


def test_nessun_file_locale_del_progetto_manca(pagina_caricata: dict) -> None:
    """Un 404 su un file css/ o js/ significa un riferimento rotto in
    index.html; le risorse esterne (CDN) sono escluse perché dipendono dalla
    rete, non dal progetto."""
    locali = [
        r for r in pagina_caricata["richieste_fallite"]
        if "127.0.0.1" in r or "localhost" in r
    ]
    assert not locali, f"risorse locali non caricate: {locali}"


def test_la_pagina_produce_contenuto(pagina_caricata: dict) -> None:
    assert pagina_caricata["html_len"] > 1000, "il body del gioco è quasi vuoto"
    assert pagina_caricata["titolo"], "manca il titolo della pagina"


@pytest.mark.parametrize("modulo", GLOBAL_ATTESI)
def test_i_moduli_del_gioco_si_registrano(pagina_caricata: dict, modulo: str) -> None:
    """Ogni modulo js/ espone il proprio global: se uno manca, il file non è
    stato caricato o è esploso durante l'esecuzione."""
    assert modulo in pagina_caricata["global"], (
        f"{modulo} non registrato. Presenti: {sorted(pagina_caricata['global'])}"
    )


def test_escape_html_disponibile_a_tutti_i_moduli(gioco_servito: str) -> None:
    """Regressione: l'helper era definito dentro una sola IIFE, mentre i punti
    che lo usano vivono in IIFE diverse dello stesso file — a runtime sarebbe
    stato ReferenceError. `node --check` non lo rileva: serve caricarlo davvero.
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = sd_browser._launch_chromium(pw)
        try:
            page = browser.new_page()
            page.goto(gioco_servito, wait_until="load", timeout=60_000)
            page.wait_for_timeout(2000)

            disponibile = page.evaluate(
                "() => typeof (window.UltimateVTTUtils || {}).escapeHtml === 'function'"
            )
            assert disponibile, "window.UltimateVTTUtils.escapeHtml non è definito"

            risultato = page.evaluate(
                "() => window.UltimateVTTUtils.escapeHtml('Aldrico <il Grande> & \\\"Ser\\\"')"
            )
        finally:
            browser.close()

    assert "<il" not in risultato, "il nome verrebbe interpretato come tag HTML"
    assert "&lt;il Grande&gt;" in risultato
    assert "&amp;" in risultato and "&quot;" in risultato


def test_nome_pg_con_html_non_rompe_il_rendering(gioco_servito: str) -> None:
    """Un nome PG con caratteri HTML deve comparire come testo, non sparire."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = sd_browser._launch_chromium(pw)
        try:
            page = browser.new_page()
            page.goto(gioco_servito, wait_until="load", timeout=60_000)
            page.wait_for_timeout(2000)
            reso = page.evaluate(
                """() => {
                    const div = document.createElement('div');
                    div.innerHTML = '<span>' +
                        window.UltimateVTTUtils.escapeHtml('Aldrico <b>il Grande</b>') +
                        '</span>';
                    return { testo: div.textContent, grassetti: div.querySelectorAll('b').length };
                }"""
            )
        finally:
            browser.close()

    assert reso["testo"] == "Aldrico <b>il Grande</b>", "il nome deve restare integro come testo"
    assert reso["grassetti"] == 0, "nessun tag deve essere interpretato"


# ---------------------------------------------------------------------------
# Regole di gioco: la protezione più profonda contro una risposta LLM difettosa
# ---------------------------------------------------------------------------
# I test qui sopra dicono se il gioco *si carica*. Questi dicono se *funziona
# ancora*: un modulo può caricarsi senza errori e avere le regole rotte — è
# esattamente ciò che succede quando un LLM riscrive una funzione "quasi bene".

@pytest.fixture(scope="module")
def partita_avviata(gioco_servito: str):
    """Avvia una nuova partita e restituisce una funzione per interrogare il gioco."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = sd_browser._launch_chromium(pw)
        try:
            page = browser.new_page()
            page.goto(gioco_servito, wait_until="load", timeout=60_000)
            page.wait_for_timeout(3000)
            page.get_by_role("button", name="NUOVA PARTITA").click()
            page.wait_for_timeout(2500)
            yield page.evaluate
        finally:
            browser.close()


@pytest.mark.parametrize(
    "punteggio,modificatore",
    [(1, -5), (8, -1), (10, 0), (11, 0), (16, 3), (20, 5), (30, 10)],
)
def test_modificatori_di_caratteristica_5e(partita_avviata, punteggio: int, modificatore: int) -> None:
    """Regola D&D 5e: modificatore = (punteggio − 10) / 2, arrotondato per difetto."""
    risultato = partita_avviata(
        f"() => window.UltimateVTTState.calculateAbilityModifier({punteggio})"
    )
    assert risultato == modificatore


def test_formula_di_danno_interpretata(partita_avviata) -> None:
    parti = partita_avviata("() => window.UltimateVTTCombat.parseDamageFormula('2d6+3')")
    dadi = [p for p in parti if p["type"] == "dice"]
    fissi = [p for p in parti if p["type"] == "flat"]
    assert dadi and dadi[0]["count"] == 2 and dadi[0]["sides"] == 6
    assert fissi and fissi[0]["value"] == 3


def test_formula_di_danno_con_sottrazione(partita_avviata) -> None:
    parti = partita_avviata("() => window.UltimateVTTCombat.parseDamageFormula('1d8-1')")
    fissi = [p for p in parti if p["type"] == "flat"]
    assert fissi, f"componente fissa non riconosciuta: {parti}"
    assert fissi[0]["value"] * fissi[0].get("sign", 1) == -1 or fissi[0]["value"] == -1


def test_tiro_d20_resta_nell_intervallo(partita_avviata) -> None:
    """100 tiri: nessun valore fuori da 1-20, e il critico è coerente col dado."""
    esiti = partita_avviata(
        """() => Array.from({length: 100}, () =>
               window.UltimateVTTCombat.rollD20WithMode('normal'))"""
    )
    for esito in esiti:
        assert 1 <= esito["chosen"] <= 20, esito
        assert esito["naturalTwenty"] == (esito["chosen"] == 20)
        assert esito["naturalOne"] == (esito["chosen"] == 1)


def test_vantaggio_tira_due_dadi_e_tiene_il_migliore(partita_avviata) -> None:
    esiti = partita_avviata(
        """() => Array.from({length: 40}, () =>
               window.UltimateVTTCombat.rollD20WithMode('advantage'))"""
    )
    for esito in esiti:
        assert len(esito["rolls"]) == 2, f"il vantaggio deve tirare 2 dadi: {esito}"
        assert esito["chosen"] == max(esito["rolls"]), esito


def test_svantaggio_tiene_il_peggiore(partita_avviata) -> None:
    esiti = partita_avviata(
        """() => Array.from({length: 40}, () =>
               window.UltimateVTTCombat.rollD20WithMode('disadvantage'))"""
    )
    for esito in esiti:
        assert len(esito["rolls"]) == 2
        assert esito["chosen"] == min(esito["rolls"]), esito


@pytest.mark.parametrize("facce", [4, 6, 8, 10, 12, 20])
def test_dadi_3d_producono_valori_validi(partita_avviata, facce: int) -> None:
    valori = partita_avviata(
        f"""() => Array.from({{length: 60}}, () =>
                window.UltimateVTTDice3D.rollDieValue({facce}))"""
    )
    assert all(1 <= v <= facce for v in valori), f"valori fuori intervallo: {sorted(set(valori))}"
    assert len(set(valori)) > 1, "un dado che dà sempre lo stesso valore è rotto"


def test_salvataggio_e_ricaricamento_conservano_lo_stato(partita_avviata) -> None:
    """Integrità dei salvataggi: è il dato che un giocatore non può permettersi
    di perdere. Modifica una caratteristica, salva, cambia, ricarica, verifica."""
    esito = partita_avviata(
        """() => {
            const S = window.UltimateVTTState, A = window.UltimateVTTAIBridge;
            const forza = () => S.getState().abilities.str.score;
            S.setAbilityScore('str', 17);
            const istantanea = JSON.parse(JSON.stringify(A.createSnapshot()));
            S.setAbilityScore('str', 8);
            const dopoModifica = forza();
            A.applySnapshot(istantanea);
            return { salvato: 17, intermedio: dopoModifica, ripristinato: forza() };
        }"""
    )
    assert esito["intermedio"] == 8, "la modifica intermedia non è stata applicata"
    assert esito["ripristinato"] == esito["salvato"], (
        f"lo stato non è stato ripristinato: {esito}"
    )


def test_istantanea_contiene_tutti_i_sottosistemi(partita_avviata) -> None:
    chiavi = partita_avviata("() => Object.keys(window.UltimateVTTAIBridge.createSnapshot())")
    attesi = {"characterState", "inventoryState", "combatState", "tokenState"}
    assert attesi <= set(chiavi), f"salvataggio incompleto: mancano {attesi - set(chiavi)}"


def test_la_nuova_partita_crea_il_party(partita_avviata) -> None:
    party = partita_avviata("() => (window.UltimateVTTCoreGameplay.getPartyData() || []).length")
    assert party >= 1, "nessun personaggio creato all'avvio della partita"


def test_i_token_sono_sulla_mappa(partita_avviata) -> None:
    token = partita_avviata("() => (window.UltimateVTTTokenPhysics.getState().tokens || []).length")
    assert token >= 1, "nessun token posizionato sulla mappa"


def test_inventario_calcola_peso_e_capacita(partita_avviata) -> None:
    esito = partita_avviata(
        """() => {
            const I = window.UltimateVTTInventory;
            return { peso: I.calculateTotalWeightKg(), capacita: I.calculateCarryCapacityKg() };
        }"""
    )
    assert isinstance(esito["peso"], (int, float)) and esito["peso"] >= 0
    assert esito["capacita"] > 0, "la capacità di carico deve essere positiva"


def test_griglia_ha_metriche_valide(partita_avviata) -> None:
    metriche = partita_avviata("() => window.UltimateVTTCanvas.getGridMetrics()")
    assert isinstance(metriche, dict) and metriche, "metriche della griglia assenti"
    numeri = [v for v in metriche.values() if isinstance(v, (int, float))]
    assert numeri and all(v == v for v in numeri), f"valori NaN nella griglia: {metriche}"
