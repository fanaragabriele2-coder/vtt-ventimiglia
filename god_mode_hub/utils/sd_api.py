"""Client per l'API locale di Stable Diffusion (A1111/Forge via Stability Matrix).

Presuppone una WebUI avviata con ``--api``. La porta di solito è 7860, ma
Stability Matrix ne assegna una diversa se la 7860 risulta occupata (es. da
un'altra istanza già aperta) — per questo il modulo **scansiona in autonomia**
un elenco di porte comuni (:func:`resolve_base_url`) invece di assumere
sempre 7860, salvo che tu imposti esplicitamente la env var ``SD_API_URL``,
che ha sempre la precedenza. Tutto il traffico resta su localhost: nessuna
API cloud. Supporta ControlNet (estensione sd-webui-controlnet) per
vincolare la vista top-down dei token VTT usando un'immagine guida.
"""

from __future__ import annotations

import base64
import os
from typing import Any

import requests

DEFAULT_BASE_URL = os.environ.get("SD_API_URL", "http://127.0.0.1:7860")
DEFAULT_TIMEOUT = 300.0  # generazioni grandi su RTX 5080: ampio margine

#: Porte alternative note per Stability Matrix/A1111/Forge/ComfyUI quando la
#: 7860 è occupata o è stata cambiata a mano nelle Launch Options.
COMMON_PORTS: tuple[int, ...] = (7860, 7861, 7862, 7863, 7864, 7865, 7866, 8000, 8080)

#: Prompt negativo standard per asset VTT puliti.
DEFAULT_NEGATIVE = (
    "blurry, lowres, jpeg artifacts, watermark, text, signature, cropped, "
    "deformed, extra limbs, worst quality"
)


class SDApiError(RuntimeError):
    """Errore nella comunicazione con l'API di Stable Diffusion."""


def is_available(base_url: str = DEFAULT_BASE_URL, timeout: float = 3.0) -> bool:
    """True se la WebUI risponde all'endpoint API su questo indirizzo esatto."""
    try:
        response = requests.get(f"{base_url}/sdapi/v1/options", timeout=timeout)
        return response.ok
    except requests.RequestException:
        return False


def _candidate_urls() -> list[str]:
    """URL configurato per primo, poi le porte comuni sullo stesso host."""
    host_prefix = DEFAULT_BASE_URL.rsplit(":", 1)[0]  # es. "http://127.0.0.1"
    urls = [DEFAULT_BASE_URL]
    for port in COMMON_PORTS:
        candidate = f"{host_prefix}:{port}"
        if candidate not in urls:
            urls.append(candidate)
    return urls


_resolved_base_url: str | None = None


def resolve_base_url(force: bool = False, timeout: float = 1.2) -> str | None:
    """Trova la porta su cui risponde davvero Stable Diffusion.

    Prova prima l'URL configurato (env ``SD_API_URL`` o default 7860), poi le
    :data:`COMMON_PORTS`. Il risultato resta in cache per il processo Python
    in corso (l'app Streamlit non riscansiona a ogni rerun); passa
    ``force=True`` per forzare una nuova scansione, ad esempio dopo aver
    riavviato la WebUI.

    Returns:
        Il primo URL raggiungibile, o ``None`` se nessuna porta risponde.
    """
    global _resolved_base_url
    if _resolved_base_url and not force and is_available(_resolved_base_url, timeout=timeout):
        return _resolved_base_url
    for url in _candidate_urls():
        if is_available(url, timeout=timeout):
            _resolved_base_url = url
            return url
    _resolved_base_url = None
    return None


def is_available_anywhere(timeout: float = 1.2) -> bool:
    """True se Stable Diffusion risponde su una qualunque porta candidata."""
    return resolve_base_url(timeout=timeout) is not None


def list_models(base_url: str | None = None, timeout: float = 10.0) -> list[str]:
    """Elenca i checkpoint disponibili (lista vuota in caso di errore)."""
    url = base_url or resolve_base_url() or DEFAULT_BASE_URL
    try:
        response = requests.get(f"{url}/sdapi/v1/sd-models", timeout=timeout)
        response.raise_for_status()
        return [m.get("title", "?") for m in response.json()]
    except (requests.RequestException, ValueError):
        return []


def build_token_prompt(subject: str) -> tuple[str, str]:
    """Prompt ingegnerizzato per un token VTT top-down.

    Returns:
        ``(prompt, negative_prompt)``.
    """
    prompt = (
        f"top-down view of {subject}, tabletop RPG token, overhead perspective, "
        "centered, full body visible from above, circular composition, "
        "plain neutral background, high detail, digital painting, sharp focus"
    )
    return prompt, DEFAULT_NEGATIVE


def build_character_prompt(name: str, description: str) -> tuple[str, str]:
    """Prompt ingegnerizzato per un personaggio full-body (adatto a Image-to-3D).

    Posa neutra e sfondo uniforme migliorano molto la ricostruzione TripoSR.
    """
    prompt = (
        f"full body character concept art of {name}, {description}, "
        "standing neutral A-pose, front view, centered, plain white background, "
        "single character, high detail, sharp focus, studio lighting"
    )
    return prompt, DEFAULT_NEGATIVE + ", multiple characters, close-up, portrait only"


def build_controlnet_unit(
    image_bytes: bytes,
    module: str = "depth_midas",
    model: str = "",
    weight: float = 0.9,
) -> dict[str, Any]:
    """Costruisce l'unità ControlNet per ``alwayson_scripts``.

    Args:
        image_bytes: immagine guida (es. template top-down di un token).
        module: preprocessore ControlNet (depth, canny, openpose…).
        model: nome del modello ControlNet installato ("" = default WebUI).
        weight: peso del vincolo (0..2).
    """
    return {
        "enabled": True,
        "image": base64.b64encode(image_bytes).decode("ascii"),
        "module": module,
        "model": model,
        "weight": weight,
        "resize_mode": 1,  # crop and resize
        "pixel_perfect": True,
        "guidance_start": 0.0,
        "guidance_end": 1.0,
        "control_mode": 0,  # balanced
    }


def txt2img(
    prompt: str,
    negative_prompt: str = DEFAULT_NEGATIVE,
    steps: int = 28,
    width: int = 1024,
    height: int = 1024,
    cfg_scale: float = 7.0,
    seed: int = -1,
    sampler_name: str = "DPM++ 2M",
    controlnet_unit: dict[str, Any] | None = None,
    base_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> bytes:
    """Genera un'immagine e restituisce i byte PNG.

    Args:
        controlnet_unit: unità creata con :func:`build_controlnet_unit` per
            vincolare la composizione (es. vista top-down); None per disattivare.
        base_url: forza un indirizzo specifico; se ``None`` (default) usa
            :func:`resolve_base_url` per trovare automaticamente la porta giusta.

    Raises:
        SDApiError: se nessuna porta risponde o la risposta non contiene immagini.
    """
    url = base_url or resolve_base_url() or DEFAULT_BASE_URL
    payload: dict[str, Any] = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "steps": steps,
        "width": width,
        "height": height,
        "cfg_scale": cfg_scale,
        "seed": seed,
        "sampler_name": sampler_name,
        "batch_size": 1,
        "n_iter": 1,
    }
    if controlnet_unit is not None:
        payload["alwayson_scripts"] = {"controlnet": {"args": [controlnet_unit]}}

    try:
        response = requests.post(
            f"{url}/sdapi/v1/txt2img", json=payload, timeout=timeout
        )
        response.raise_for_status()
        data = response.json()
    except requests.ConnectionError as exc:
        tried = ", ".join(_candidate_urls())
        raise SDApiError(
            f"Stable Diffusion non raggiungibile (provate: {tried}). Avvia la "
            "WebUI da Stability Matrix con l'opzione --api attiva, oppure "
            "imposta SD_API_URL se usa una porta non elencata."
        ) from exc
    except requests.RequestException as exc:
        raise SDApiError(f"Errore API Stable Diffusion: {exc}") from exc
    except ValueError as exc:
        raise SDApiError("Risposta non-JSON dall'API Stable Diffusion.") from exc

    images = data.get("images") or []
    if not images:
        raise SDApiError("L'API non ha restituito immagini (controlla i log WebUI).")
    # Alcune versioni antepongono "data:image/png;base64,".
    b64_payload = images[0].split(",", 1)[-1]
    try:
        return base64.b64decode(b64_payload)
    except (ValueError, TypeError) as exc:
        raise SDApiError("Immagine base64 non decodificabile.") from exc
