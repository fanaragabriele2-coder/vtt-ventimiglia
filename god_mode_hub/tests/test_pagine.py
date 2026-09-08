"""Smoke test delle pagine Streamlit: caricamento e interazione reale.

Usa ``AppTest`` (il runner ufficiale di Streamlit) per eseguire ogni pagina
senza browser, cliccare bottoni e riempire campi. Copre la regressione più
banale e più costosa: una pagina che esplode all'apertura o al primo click
perché Stable Diffusion è spento o un indice non esiste ancora.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("streamlit", reason="streamlit non installato")
from streamlit.testing.v1 import AppTest  # noqa: E402

HUB_ROOT = Path(__file__).resolve().parents[1]
PAGINE = [
    HUB_ROOT / "app.py",
    *sorted((HUB_ROOT / "pages").glob("*.py")),
]


def _esegui(percorso: Path) -> AppTest:
    at = AppTest.from_file(str(percorso), default_timeout=120)
    at.run()
    return at


@pytest.mark.parametrize("pagina", PAGINE, ids=lambda p: p.stem)
def test_la_pagina_si_apre_senza_eccezioni(pagina: Path) -> None:
    """Ogni pagina deve aprirsi anche con SD spento e indici vuoti."""
    at = _esegui(pagina)
    assert not at.exception, [str(e.value) for e in at.exception]


def test_ricerca_rag_senza_indice_non_esplode() -> None:
    """Il fallback full-text deve reggere anche senza ChromaDB indicizzato."""
    at = _esegui(HUB_ROOT / "pages" / "02_🧠_Secondo_Cervello.py")
    at.text_input(key="rag_query").set_value("movimento token griglia").run()
    assert not at.exception, [str(e.value) for e in at.exception]


def test_ricerca_wiki_senza_indice_non_esplode() -> None:
    at = _esegui(HUB_ROOT / "pages" / "02_🧠_Secondo_Cervello.py")
    at.text_input(key="wiki_query").set_value("regole token").run()
    assert not at.exception, [str(e.value) for e in at.exception]


def test_generazione_mega_prompt() -> None:
    """Il mega-prompt deve assemblarsi con contesto RAG e wiki reali."""
    at = _esegui(HUB_ROOT / "pages" / "03_⚙️_Orchestratore.py")
    at.text_area[0].set_value("Aggiungi lo snap alla griglia nel drag dei token").run()
    [b for b in at.button if "Mega-Prompt" in b.label][0].click().run()
    assert not at.exception, [str(e.value) for e in at.exception]
    assert at.session_state["mega_prompt"], "il mega-prompt non deve essere vuoto"
    assert "Contratto di output" in at.session_state["mega_prompt"]


def test_drop_zone_analizza_senza_salvare() -> None:
    """Analizzare una risposta non deve scrivere nulla su disco."""
    at = _esegui(HUB_ROOT / "pages" / "03_⚙️_Orchestratore.py")
    at.text_area(key="drop_text").set_value(
        "```javascript\n// js/99-test-mai-salvato.js\nconsole.log(1);\n```\n"
    ).run()
    [b for b in at.button if "Analizza" in b.label][0].click().run()
    assert not at.exception, [str(e.value) for e in at.exception]
    assert at.session_state["parsed_blocks"], "il blocco deve essere riconosciuto"
    assert not (HUB_ROOT.parent / "js" / "99-test-mai-salvato.js").exists()


@pytest.mark.parametrize(
    "pagina,indice_campo,valore",
    [
        ("04_🎨_Asset_Forge.py", 0, "goblin sciamano"),
        ("06_🎬_Animazioni.py", 0, "fiamma viola pulsante"),
    ],
)
def test_pagine_generative_reggono_sd_spento(pagina: str, indice_campo: int, valore: str) -> None:
    """Con SD offline le pagine devono restare usabili, non rompersi."""
    at = _esegui(HUB_ROOT / "pages" / pagina)
    at.text_input[indice_campo].set_value(valore).run()
    assert not at.exception, [str(e.value) for e in at.exception]


def test_generatore_personaggi_regge_sd_spento() -> None:
    at = _esegui(HUB_ROOT / "pages" / "05_👤_Generatore_Personaggi.py")
    at.text_input[0].set_value("Ser Aldrico").run()
    at.text_area[0].set_value("cavaliere errante mezz'elfo").run()
    assert not at.exception, [str(e.value) for e in at.exception]


def test_drop_zone_avvisa_su_risposta_troncata() -> None:
    """La rete di sicurezza dev'essere visibile nell'interfaccia, non solo nei moduli.

    Simula il caso reale: l'LLM restituisce uno stub al posto di un modulo VTT
    esistente. La pagina deve mostrare l'allarme troncatura e non deve
    modificare il file su disco.
    """
    bersaglio = HUB_ROOT.parent / "js" / "16-enemy-spawn.js"
    if not bersaglio.exists():
        pytest.skip("file VTT di riferimento assente")
    contenuto_prima = bersaglio.read_bytes()

    at = _esegui(HUB_ROOT / "pages" / "03_⚙️_Orchestratore.py")
    at.text_area(key="drop_text").set_value(
        "```javascript\n// js/16-enemy-spawn.js\n// ... resto del codice invariato ...\n```\n"
    ).run()
    [b for b in at.button if "Analizza" in b.label][0].click().run()

    assert not at.exception, [str(e.value) for e in at.exception]
    testo_pagina = " ".join(e.value for e in at.error) + " ".join(w.value for w in at.warning)
    assert "TRONCATA" in testo_pagina.upper(), f"allarme troncatura assente: {testo_pagina[:300]}"
    assert bersaglio.read_bytes() == contenuto_prima, "l'analisi non deve toccare il disco"


def test_drop_zone_blocca_aree_protette_nella_ui() -> None:
    at = _esegui(HUB_ROOT / "pages" / "03_⚙️_Orchestratore.py")
    at.text_area(key="drop_text").set_value(
        "```javascript\n// dist/ultimate-vtt.html\nrotto\n```\n"
    ).run()
    [b for b in at.button if "Analizza" in b.label][0].click().run()
    at.text_input(key="path_0").set_value("dist/bundle.js").run()

    assert not at.exception, [str(e.value) for e in at.exception]
    testo = " ".join(e.value for e in at.error)
    assert "protetta" in testo.lower(), f"nessun blocco area protetta: {testo[:300]}"
