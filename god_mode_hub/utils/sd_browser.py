"""Automazione della UI Gradio di Stable Diffusion via browser (Playwright).

Percorso **alternativo** a ``sd_api.py`` per chi non vuole aggiungere
``--api`` al proprio launcher: invece di chiamare l'endpoint REST
``/sdapi/v1/txt2img`` (che esiste solo con quel flag), questo modulo pilota
direttamente l'interfaccia grafica Gradio già aperta dal launcher esistente
— scrive il prompt, clicca "Generate", legge l'immagine dalla galleria —
esattamente come farebbe un utente umano. Funziona perché Gradio espone
sempre il proprio canale UI interno, indipendentemente dal flag ``--api`` di
A1111/Forge (che aggiunge *in più* gli endpoint ``/sdapi/v1/*``, ma non
disattiva la UI stessa).

Setup una tantum, separato dall'Hub, **nessuna modifica al launcher di
Stable Diffusion**::

    python -m pip install playwright
    python -m playwright install chromium

I selettori puntano agli ``elem_id`` stabili di AUTOMATIC1111/Forge
(``modules/ui.py``): ``#txt2img_prompt``, ``#txt2img_neg_prompt``,
``#txt2img_generate``, ``#txt2img_gallery``. Sono una convenzione della
community mantenuta apposta per script/estensioni del browser, quindi
stabile tra versioni e fork — ma non testabile da qui contro la tua
installazione reale: usa :func:`probe_ui_elements` come primo test.
"""

from __future__ import annotations

import base64
import os

DEFAULT_TIMEOUT_MS = 180_000  # generazioni pesanti: ampio margine
HEADLESS = os.environ.get("SD_BROWSER_HEADLESS", "1") != "0"
#: Percorso esplicito dell'eseguibile Chromium, opzionale. Normalmente non
#: serve: ``playwright install chromium`` scarica una build già allineata
#: alla versione del pacchetto pip installato. Utile solo per ambienti con
#: un Chromium preinstallato a parte (es. CI, container di sviluppo).
_CHROMIUM_PATH = os.environ.get("SD_BROWSER_CHROMIUM_PATH") or None


def _launch_chromium(pw):
    kwargs: dict[str, object] = {"headless": HEADLESS}
    if _CHROMIUM_PATH:
        kwargs["executable_path"] = _CHROMIUM_PATH
    return pw.chromium.launch(**kwargs)


#: Selettori CSS per gli elementi chiave della tab txt2img (elem_id A1111/Forge).
_SELECTORS: dict[str, str] = {
    "prompt": "#txt2img_prompt textarea",
    "negative_prompt": "#txt2img_neg_prompt textarea",
    "generate": "#txt2img_generate",
    "gallery": "#txt2img_gallery",
}


class SDBrowserError(RuntimeError):
    """Errore nell'automazione della UI Gradio di Stable Diffusion."""


def is_playwright_installed() -> bool:
    """True se il pacchetto Python ``playwright`` è importabile."""
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    return True


def _require_playwright() -> None:
    if not is_playwright_installed():
        raise SDBrowserError(
            "Playwright non installato. Esegui una volta sola, nel venv "
            "dell'Hub:\n"
            "  python -m pip install playwright\n"
            "  python -m playwright install chromium"
        )


def probe_ui_elements(base_url: str, timeout_ms: int = 30_000) -> dict[str, bool]:
    """Verifica se questa installazione ha gli ``elem_id`` attesi dall'automazione.

    Da eseguire come primo test su una build mai provata: se una chiave
    risulta ``False``, la generazione via browser fallirà su quell'elemento
    e serve adattare il selettore (manda uno screenshot dell'errore).
    """
    _require_playwright()
    from playwright.sync_api import sync_playwright

    results: dict[str, bool] = {}
    with sync_playwright() as pw:
        browser = _launch_chromium(pw)
        try:
            page = browser.new_page()
            page.goto(base_url, timeout=timeout_ms, wait_until="domcontentloaded")
            page.wait_for_timeout(2500)  # Gradio monta i componenti via JS dopo il load
            for name, selector in _SELECTORS.items():
                results[name] = page.locator(selector).count() > 0
        finally:
            browser.close()
    return results


def txt2img_via_browser(
    base_url: str,
    prompt: str,
    negative_prompt: str = "",
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> bytes:
    """Genera un'immagine pilotando la UI Gradio esistente (nessuna API REST).

    Args:
        base_url: indirizzo della WebUI (es. ``http://127.0.0.1:7860``).
        prompt: prompt positivo.
        negative_prompt: prompt negativo (opzionale).
        timeout_ms: timeout per ogni fase (apertura pagina, generazione…).

    Raises:
        SDBrowserError: Playwright/Chromium non installati, elementi UI non
            trovati (build/tema con ``elem_id`` diversi), timeout di
            generazione, o immagine non recuperabile dalla galleria.
    """
    _require_playwright()
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        try:
            browser = _launch_chromium(pw)
        except PlaywrightError as exc:
            raise SDBrowserError(
                "Chromium di Playwright non trovato. Esegui una volta sola: "
                "python -m playwright install chromium"
            ) from exc
        try:
            page = browser.new_page()
            try:
                page.goto(base_url, timeout=timeout_ms, wait_until="domcontentloaded")

                prompt_box = page.locator(_SELECTORS["prompt"]).first
                prompt_box.wait_for(state="visible", timeout=timeout_ms)
                prompt_box.fill(prompt)

                if negative_prompt:
                    neg_box = page.locator(_SELECTORS["negative_prompt"]).first
                    if neg_box.count() > 0:
                        neg_box.fill(negative_prompt)

                # Cattura lo stato "prima" tramite lo src dell'ultima immagine,
                # non il conteggio: il componente Gallery di Gradio di norma
                # SOSTITUISCE il proprio contenuto (stesso numero di elementi,
                # <img> distrutto e ricreato) invece di aggiungere — contare
                # gli elementi non rileverebbe mai il cambiamento in quel caso.
                gallery_selector = _SELECTORS["gallery"]
                prev_imgs = page.locator(f"{gallery_selector} img")
                prev_last_src = prev_imgs.last.get_attribute("src") if prev_imgs.count() > 0 else None

                page.locator(_SELECTORS["generate"]).click()

                # Aspetta che l'ULTIMA immagine sia diversa da quella di prima
                # (per src) e completamente caricata — vale sia se Gradio
                # sostituisce sia se aggiunge in coda.
                page.wait_for_function(
                    """([sel, prevSrc]) => {
                        const imgs = document.querySelectorAll(sel + ' img');
                        if (imgs.length === 0) return false;
                        const last = imgs[imgs.length - 1];
                        return !!last.src && last.complete && last.naturalWidth > 0 &&
                               last.src !== prevSrc;
                    }""",
                    arg=[gallery_selector, prev_last_src],
                    timeout=timeout_ms,
                )

                # .last, non .first: Gradio di norma SOSTITUISCE il contenuto
                # della galleria (quindi last==first, un solo risultato), ma
                # alcuni temi/skin AGGIUNGONO in coda — .last prende sempre
                # quella appena generata in entrambi i casi, .first avrebbe
                # restituito un risultato vecchio nel caso "aggiunta".
                img_src = page.locator(f"{gallery_selector} img").last.get_attribute("src")
                if not img_src:
                    raise SDBrowserError(
                        "Generazione completata ma nessuna immagine trovata in galleria."
                    )

                if img_src.startswith("data:"):
                    _header, b64data = img_src.split(",", 1)
                    return base64.b64decode(b64data)

                response = page.request.get(img_src, timeout=timeout_ms)
                if not response.ok:
                    raise SDBrowserError(f"Download immagine fallito: HTTP {response.status}")
                return response.body()
            except PlaywrightTimeout as exc:
                raise SDBrowserError(
                    f"Timeout durante l'automazione della UI ({timeout_ms / 1000:.0f}s). "
                    "La generazione potrebbe essere solo lenta (GPU occupata), oppure "
                    "gli elementi dell'interfaccia hanno un ID diverso su questa build "
                    "(fork/tema personalizzato) — esegui prima 'Testa selettori browser' "
                    "nella diagnostica."
                ) from exc
            except SDBrowserError:
                raise
            except PlaywrightError as exc:
                raise SDBrowserError(
                    f"Impossibile completare l'automazione su {base_url}: {exc}. "
                    "Verifica che l'indirizzo sia corretto e che la WebUI sia "
                    "davvero raggiungibile in un browser normale."
                ) from exc
        finally:
            browser.close()
