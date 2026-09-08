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
