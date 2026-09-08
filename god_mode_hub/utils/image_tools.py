"""Post-produzione locale delle immagini generate: sfondo, ritaglio, token VTT.

Stable Diffusion produce un PNG quadrato con lo sfondo pieno. Un token da
tavolo virtuale invece è **circolare e trasparente**, altrimenti sulla mappa
si vede il quadrato di sfondo sopra il terreno. Finora quel passaggio andava
fatto a mano in un editor di immagini.

Rimozione dello sfondo, in ordine di preferenza:

1. ``rembg`` se installato (rete neurale U²-Net locale, qualità migliore,
   funziona anche su sfondi complessi);
2. altrimenti un **flood fill dai bordi** con tolleranza, che sfrutta il fatto
   che i prompt dell'Hub chiedono già esplicitamente *"plain neutral
   background"*: nessuna dipendenza aggiuntiva, risultato buono su sfondi
   uniformi.

Tutto in locale, nessuna chiamata di rete.
"""

from __future__ import annotations

import io
from collections import deque

from PIL import Image, ImageDraw, ImageFilter

#: Tolleranza di default sulla distanza colore (0-255) per il flood fill.
DEFAULT_TOLERANCE = 32


def _to_image(png_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def _to_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def rembg_available() -> bool:
    """True se ``rembg`` è installato (rimozione sfondo di qualità superiore)."""
    try:
        import rembg  # noqa: F401
    except Exception:  # noqa: BLE001 — dipendenze native possono anche andare in panic
        return False
    return True


def remove_background_floodfill(
    png_bytes: bytes,
    tolerance: int = DEFAULT_TOLERANCE,
    feather: int = 1,
) -> bytes:
    """Rende trasparente lo sfondo uniforme partendo dai quattro bordi.

    Visita i pixel connessi ai bordi il cui colore resta entro ``tolerance``
    dal colore medio degli angoli: così cancella lo sfondo senza intaccare
    aree interne dello stesso colore (un'armatura grigia su fondo grigio
    resta intatta, perché non è connessa al bordo).

    Args:
        png_bytes: immagine sorgente.
        tolerance: distanza colore massima considerata "sfondo" (0-255).
        feather: raggio di sfocatura sul bordo dell'alfa, per evitare la
            scalettatura; 0 per un taglio netto.

    Returns:
        PNG con canale alfa.
    """
    image = _to_image(png_bytes)
    width, height = image.size
    pixels = image.load()

    angoli = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    campioni = [pixels[x, y][:3] for x, y in angoli]
    riferimento = tuple(sum(c[i] for c in campioni) // len(campioni) for i in range(3))

    def e_sfondo(px: tuple[int, ...]) -> bool:
        return all(abs(px[i] - riferimento[i]) <= tolerance for i in range(3))

    # Flood fill iterativo (BFS) dai bordi: niente ricorsione, niente
    # RecursionError su immagini 1024x1024.
    visitati = bytearray(width * height)
    coda: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if e_sfondo(pixels[x, y]):
                coda.append((x, y))
                visitati[y * width + x] = 1
    for y in range(height):
        for x in (0, width - 1):
            if not visitati[y * width + x] and e_sfondo(pixels[x, y]):
                coda.append((x, y))
                visitati[y * width + x] = 1

    maschera = Image.new("L", (width, height), 255)  # 255 = opaco
    disegno = maschera.load()
    while coda:
        x, y = coda.popleft()
        disegno[x, y] = 0  # trasparente
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and not visitati[ny * width + nx]:
                if e_sfondo(pixels[nx, ny]):
                    visitati[ny * width + nx] = 1
                    coda.append((nx, ny))

    if feather > 0:
        maschera = maschera.filter(ImageFilter.GaussianBlur(feather))
    image.putalpha(maschera)
    return _to_bytes(image)


def remove_background(
    png_bytes: bytes,
    tolerance: int = DEFAULT_TOLERANCE,
    prefer_rembg: bool = True,
) -> bytes:
    """Rimuove lo sfondo con ``rembg`` se disponibile, altrimenti flood fill.

    Non solleva mai per colpa di rembg: se il modello non è scaricabile o va
    in errore, ricade sul metodo locale invece di far fallire la generazione.
    """
    if prefer_rembg and rembg_available():
        try:
            from rembg import remove  # noqa: PLC0415

            risultato = remove(png_bytes)
            if isinstance(risultato, bytes) and risultato:
                return risultato
        except Exception:  # noqa: BLE001 — qualunque problema: si continua col fallback
            pass
    return remove_background_floodfill(png_bytes, tolerance=tolerance)


def trim_transparent(png_bytes: bytes, padding: int = 0) -> bytes:
    """Ritaglia i margini completamente trasparenti attorno al soggetto.

    Args:
        padding: pixel di margine da lasciare attorno al contenuto.
    """
    image = _to_image(png_bytes)
    riquadro = image.getbbox()  # None se l'immagine è interamente trasparente
    if riquadro is None:
        return png_bytes
    if padding:
        sinistra, alto, destra, basso = riquadro
        riquadro = (
            max(sinistra - padding, 0), max(alto - padding, 0),
            min(destra + padding, image.width), min(basso + padding, image.height),
        )
    return _to_bytes(image.crop(riquadro))


def make_circular_token(
    png_bytes: bytes,
    size: int = 512,
    border_width: int = 0,
    border_color: tuple[int, int, int, int] = (20, 20, 25, 255),
    content_scale: float = 0.86,
) -> bytes:
    """Trasforma un'immagine nel token circolare che un VTT si aspetta.

    Il soggetto viene rimpicciolito dentro il cerchio invece di riempire il
    quadrato: se occupasse tutto il lato, la maschera circolare gli
    taglierebbe testa e piedi (verificato: succedeva davvero).

    Args:
        size: lato in pixel del token quadrato risultante.
        border_width: spessore dell'anello di bordo; 0 per nessun bordo.
        border_color: colore RGBA del bordo.
        content_scale: frazione del diametro occupata dal soggetto (0.86 ≈
            margine comodo); 1.0 per farlo arrivare al bordo, a rischio di
            tagli.

    Returns:
        PNG quadrato ``size``×``size`` con esterno del cerchio trasparente.
    """
    origine = _to_image(png_bytes)

    # Adatta l'INTERO soggetto dentro il quadrato conservando le proporzioni.
    # Un ritaglio quadrato centrale scarterebbe le estremità di un soggetto
    # verticale — cioè decapiterebbe il personaggio (visto succedere davvero
    # su un ritratto full-body).
    lato_contenuto = max(int(size * max(min(content_scale, 1.0), 0.1)), 1)
    fattore = min(lato_contenuto / origine.width, lato_contenuto / origine.height)
    nuova_dimensione = (
        max(int(origine.width * fattore), 1),
        max(int(origine.height * fattore), 1),
    )
    contenuto = origine.resize(nuova_dimensione, Image.LANCZOS)

    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    image.paste(
        contenuto,
        ((size - contenuto.width) // 2, (size - contenuto.height) // 2),
    )

    # Antialiasing della maschera: disegno a 4x e riduco.
    fattore = 4
    maschera = Image.new("L", (size * fattore, size * fattore), 0)
    ImageDraw.Draw(maschera).ellipse(
        (0, 0, size * fattore - 1, size * fattore - 1), fill=255
    )
    maschera = maschera.resize((size, size), Image.LANCZOS)

    # Combina con l'alfa esistente: se lo sfondo era già stato rimosso, quelle
    # trasparenze vanno conservate, non riempite dal cerchio.
    alfa_esistente = image.getchannel("A")
    image.putalpha(Image.composite(alfa_esistente, Image.new("L", (size, size), 0), maschera))

    if border_width > 0:
        disegno = ImageDraw.Draw(image)
        mezzo = border_width / 2
        disegno.ellipse(
            (mezzo, mezzo, size - 1 - mezzo, size - 1 - mezzo),
            outline=border_color, width=border_width,
        )
    return _to_bytes(image)


def prepare_vtt_token(
    png_bytes: bytes,
    size: int = 512,
    remove_bg: bool = True,
    circular: bool = True,
    border_width: int = 6,
    tolerance: int = DEFAULT_TOLERANCE,
    content_scale: float = 0.86,
) -> bytes:
    """Pipeline completa: da immagine generata a token pronto per la mappa.

    Rimozione sfondo → ritaglio sul soggetto → maschera circolare con bordo.
    Ogni passaggio è disattivabile.
    """
    risultato = png_bytes
    if remove_bg:
        risultato = remove_background(risultato, tolerance=tolerance)
        risultato = trim_transparent(risultato, padding=4)
    if circular:
        risultato = make_circular_token(
            risultato, size=size, border_width=border_width, content_scale=content_scale
        )
    return risultato
