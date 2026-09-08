"""Test dei due backend Stable Diffusion: API REST e automazione browser.

Nessuna installazione reale di Stable Diffusion è necessaria: le risposte HTTP
sono simulate, e l'automazione browser gira contro una pagina HTML locale che
replica la struttura DOM di A1111/Forge.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from utils import sd_api, sd_browser


# ---------------------------------------------------------------------------
# Costruzione dei prompt
# ---------------------------------------------------------------------------

def test_prompt_token_top_down() -> None:
    prompt, negativo = sd_api.build_token_prompt("goblin sciamano")
    assert "goblin sciamano" in prompt
    assert "top-down" in prompt and "centered" in prompt
    assert "blurry" in negativo


def test_prompt_personaggio_full_body() -> None:
    prompt, negativo = sd_api.build_character_prompt("Ser Aldrico", "cavaliere mezz'elfo")
    assert "Ser Aldrico" in prompt and "cavaliere mezz'elfo" in prompt
    assert "A-pose" in prompt and "white background" in prompt
    assert "multiple characters" in negativo


def test_unita_controlnet_codifica_immagine() -> None:
    unit = sd_api.build_controlnet_unit(b"\x89PNG_finto", module="canny", weight=0.7)
    assert unit["enabled"] is True and unit["module"] == "canny" and unit["weight"] == 0.7
    import base64
    assert base64.b64decode(unit["image"]) == b"\x89PNG_finto"


# ---------------------------------------------------------------------------
# Rilevamento della WebUI (risposte HTTP simulate)
# ---------------------------------------------------------------------------

class _RispostaFinta:
    def __init__(self, status: int, payload: Any = None, testo: str = "") -> None:
        self.status_code = status
        self.ok = 200 <= status < 300
        self._payload = payload
        self.text = testo

    def json(self) -> Any:
        if self._payload is None:
            raise ValueError("non e' JSON")
        return self._payload

    def raise_for_status(self) -> None:
        if not self.ok:
            import requests
            raise requests.HTTPError(response=self)


def test_rileva_api_valida(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sd_api.requests, "get",
                        lambda url, **kw: _RispostaFinta(200, [{"title": "modello"}]))
    assert sd_api.is_available("http://127.0.0.1:7860") is True


def test_servizio_non_sd_non_e_falso_positivo(monkeypatch: pytest.MonkeyPatch) -> None:
    """Una porta occupata da un altro servizio (200 ma HTML) non è Stable Diffusion."""
    monkeypatch.setattr(sd_api.requests, "get",
                        lambda url, **kw: _RispostaFinta(200, None, "<html>altro servizio</html>"))
    assert sd_api.is_available("http://127.0.0.1:8080") is False


def test_can_generate_distingue_405_da_404(monkeypatch: pytest.MonkeyPatch) -> None:
    """405 = endpoint POST esistente (--api attivo); 404 = assente."""
    monkeypatch.setattr(sd_api.requests, "get", lambda url, **kw: _RispostaFinta(405))
    assert sd_api.can_generate("http://127.0.0.1:7860") is True
    monkeypatch.setattr(sd_api.requests, "get", lambda url, **kw: _RispostaFinta(404))
    assert sd_api.can_generate("http://127.0.0.1:7860") is False


def test_txt2img_decodifica_png(monkeypatch: pytest.MonkeyPatch) -> None:
    import base64
    png = b"\x89PNG\r\n\x1a\nfinto"
    monkeypatch.setattr(
        sd_api.requests, "post",
        lambda url, **kw: _RispostaFinta(200, {"images": [base64.b64encode(png).decode()]}),
    )
    monkeypatch.setattr(sd_api, "resolve_base_url", lambda **kw: "http://127.0.0.1:7860")
    assert sd_api.txt2img("prova") == png


def test_txt2img_404_spiega_che_manca_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sd_api.requests, "post", lambda url, **kw: _RispostaFinta(404))
    monkeypatch.setattr(sd_api, "resolve_base_url", lambda **kw: "http://127.0.0.1:7860")
    with pytest.raises(sd_api.SDApiError, match="--api|404"):
        sd_api.txt2img("prova")


# ---------------------------------------------------------------------------
# Automazione browser (Playwright su pagina finta A1111/Forge)
# ---------------------------------------------------------------------------

_PAGINA_FINTA = """<!doctype html>
<html><body>
  <div id="txt2img_prompt"><textarea placeholder="Prompt"></textarea></div>
  <div id="txt2img_neg_prompt"><textarea placeholder="Negative"></textarea></div>
  <button id="txt2img_generate">Generate</button>
  <div id="txt2img_gallery"></div>
  <script>
    var ROSSO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    var VERDE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    document.getElementById('txt2img_gallery').innerHTML = '<img src="' + ROSSO + '">';
    document.getElementById('txt2img_generate').addEventListener('click', function () {
      setTimeout(function () { document.getElementById('txt2img_gallery').innerHTML = '<img src="' + VERDE + '">'; }, 300);
    });
  </script>
</body></html>
"""

def _chromium_utilizzabile() -> bool:
    """True se Playwright può davvero avviare Chromium in questo ambiente.

    L'automazione browser è opzionale: se il pacchetto o il binario mancano i
    test relativi vengono saltati, non falliti — così la suite resta verde su
    una macchina che usa solo il percorso API.
    """
    if not sd_browser.is_playwright_installed():
        return False
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            sd_browser._launch_chromium(pw).close()
    except Exception:
        return False
    return True


pytestmark_browser = pytest.mark.skipif(
    not _chromium_utilizzabile(),
    reason="Playwright/Chromium non disponibili (funzionalità opzionale)",
)


@pytest.fixture
def pagina_finta(tmp_path: Path) -> str:
    f = tmp_path / "finta_a1111.html"
    f.write_text(_PAGINA_FINTA, encoding="utf-8")
    return f"file://{f}"


def test_playwright_assente_da_errore_chiaro(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sd_browser, "is_playwright_installed", lambda: False)
    with pytest.raises(sd_browser.SDBrowserError, match="pip install playwright"):
        sd_browser.txt2img_via_browser("http://127.0.0.1:7860", "prova")


@pytestmark_browser
def test_probe_trova_gli_elementi_standard(pagina_finta: str) -> None:
    esito = sd_browser.probe_ui_elements(pagina_finta)
    assert all(esito.values()), f"elementi mancanti: {esito}"


@pytestmark_browser
def test_probe_su_pagina_estranea_segnala_tutto_assente(tmp_path: Path) -> None:
    f = tmp_path / "altra.html"
    f.write_text("<html><body><h1>non e' A1111</h1></body></html>", encoding="utf-8")
    esito = sd_browser.probe_ui_elements(f"file://{f}")
    assert not any(esito.values())


@pytestmark_browser
def test_generazione_restituisce_immagine_nuova(pagina_finta: str) -> None:
    """Regressione: deve attendere il NUOVO risultato, non leggere quello vecchio."""
    import base64
    verde = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )
    png = sd_browser.txt2img_via_browser(pagina_finta, "goblin", "sfocato", timeout_ms=15_000)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert png == verde


@pytestmark_browser
def test_url_irraggiungibile_da_errore_gestito() -> None:
    with pytest.raises(sd_browser.SDBrowserError):
        sd_browser.txt2img_via_browser("http://127.0.0.1:59999", "x", timeout_ms=4000)


# ---------------------------------------------------------------------------
# img2img (sprite sheet coerenti)
# ---------------------------------------------------------------------------

def test_img2img_invia_immagine_e_denoising(monkeypatch: pytest.MonkeyPatch) -> None:
    """Il frame precedente dev'essere inviato come init_image in base64."""
    import base64
    catturato: dict[str, Any] = {}
    png_atteso = b"\x89PNG\r\n\x1a\nrisultato"

    def finta_post(url: str, **kw: Any) -> _RispostaFinta:
        catturato["url"] = url
        catturato["payload"] = kw.get("json", {})
        return _RispostaFinta(200, {"images": [base64.b64encode(png_atteso).decode()]})

    monkeypatch.setattr(sd_api.requests, "post", finta_post)
    monkeypatch.setattr(sd_api, "resolve_base_url", lambda **kw: "http://127.0.0.1:7860")

    risultato = sd_api.img2img("fiamma", b"FRAME_PRECEDENTE", denoising_strength=0.35)

    assert risultato == png_atteso
    assert catturato["url"].endswith("/sdapi/v1/img2img")
    assert base64.b64decode(catturato["payload"]["init_images"][0]) == b"FRAME_PRECEDENTE"
    assert catturato["payload"]["denoising_strength"] == 0.35


def test_img2img_404_spiega_che_serve_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sd_api.requests, "post", lambda url, **kw: _RispostaFinta(404))
    monkeypatch.setattr(sd_api, "resolve_base_url", lambda **kw: "http://127.0.0.1:7860")
    with pytest.raises(sd_api.SDApiError, match="img2img"):
        sd_api.img2img("x", b"png")
