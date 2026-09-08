"""Test della post-produzione immagini: sfondo, ritaglio, token circolari.

Le immagini di prova sono costruite a mano con Pillow, così ogni assert
verifica un pixel di cui conosciamo il valore atteso.
"""

from __future__ import annotations

import io

import pytest

pytest.importorskip("PIL", reason="Pillow non installato")
from PIL import Image, ImageDraw  # noqa: E402

from utils import image_tools  # noqa: E402


def _png(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _apri(png: bytes) -> Image.Image:
    return Image.open(io.BytesIO(png)).convert("RGBA")


@pytest.fixture
def soggetto_su_sfondo_uniforme() -> bytes:
    """Cerchio rosso su sfondo grigio uniforme: il caso tipico di SD."""
    img = Image.new("RGBA", (100, 100), (128, 128, 128, 255))
    ImageDraw.Draw(img).ellipse((25, 25, 75, 75), fill=(220, 30, 30, 255))
    return _png(img)


# ---------------------------------------------------------------------------
# Rimozione sfondo
# ---------------------------------------------------------------------------

def test_sfondo_uniforme_diventa_trasparente(soggetto_su_sfondo_uniforme: bytes) -> None:
    risultato = _apri(image_tools.remove_background_floodfill(soggetto_su_sfondo_uniforme, feather=0))

    assert risultato.getpixel((2, 2))[3] == 0, "l'angolo di sfondo deve essere trasparente"
    assert risultato.getpixel((50, 50))[3] == 255, "il soggetto deve restare opaco"


def test_soggetto_conserva_il_colore(soggetto_su_sfondo_uniforme: bytes) -> None:
    risultato = _apri(image_tools.remove_background_floodfill(soggetto_su_sfondo_uniforme, feather=0))
    r, g, b, _ = risultato.getpixel((50, 50))
    assert (r, g, b) == (220, 30, 30)


def test_area_interna_dello_stesso_colore_dello_sfondo_resta(soggetto_su_sfondo_uniforme: bytes) -> None:
    """Un dettaglio grigio DENTRO il soggetto non deve sparire: il flood fill
    parte dai bordi e non raggiunge le aree non connesse."""
    img = _apri(soggetto_su_sfondo_uniforme)
    ImageDraw.Draw(img).ellipse((45, 45, 55, 55), fill=(128, 128, 128, 255))  # occhio grigio

    risultato = _apri(image_tools.remove_background_floodfill(_png(img), feather=0))

    assert risultato.getpixel((50, 50))[3] == 255, "il dettaglio interno non va cancellato"
    assert risultato.getpixel((2, 2))[3] == 0, "lo sfondo esterno sì"


def test_tolleranza_gestisce_sfondo_rumoroso() -> None:
    """Uno sfondo con leggera variazione (tipico di SD) va comunque rimosso."""
    img = Image.new("RGBA", (60, 60))
    for x in range(60):
        for y in range(60):
            base = 130 + ((x + y) % 7)  # rumore ±3
            img.putpixel((x, y), (base, base, base, 255))
    ImageDraw.Draw(img).rectangle((20, 20, 40, 40), fill=(10, 200, 10, 255))

    risultato = _apri(image_tools.remove_background_floodfill(_png(img), tolerance=20, feather=0))

    assert risultato.getpixel((1, 1))[3] == 0
    assert risultato.getpixel((30, 30))[3] == 255


def test_immagine_grande_non_supera_i_limiti_di_ricorsione() -> None:
    """Regressione: un flood fill ricorsivo esploderebbe su 1024x1024."""
    img = Image.new("RGBA", (1024, 1024), (100, 100, 100, 255))
    ImageDraw.Draw(img).ellipse((400, 400, 600, 600), fill=(255, 0, 0, 255))
    risultato = _apri(image_tools.remove_background_floodfill(_png(img), feather=0))
    assert risultato.getpixel((5, 5))[3] == 0
    assert risultato.getpixel((500, 500))[3] == 255


def test_remove_background_ricade_sul_floodfill(monkeypatch: pytest.MonkeyPatch,
                                                soggetto_su_sfondo_uniforme: bytes) -> None:
    """Se rembg non c'è (o fallisce) si usa comunque il metodo locale."""
    monkeypatch.setattr(image_tools, "rembg_available", lambda: False)
    risultato = _apri(image_tools.remove_background(soggetto_su_sfondo_uniforme))
    assert risultato.getpixel((2, 2))[3] == 0


# ---------------------------------------------------------------------------
# Ritaglio
# ---------------------------------------------------------------------------

def test_trim_rimuove_i_margini_trasparenti() -> None:
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle((40, 40, 60, 60), fill=(255, 0, 0, 255))
    risultato = _apri(image_tools.trim_transparent(_png(img)))
    assert risultato.size == (21, 21)


def test_trim_con_margine() -> None:
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle((40, 40, 60, 60), fill=(255, 0, 0, 255))
    risultato = _apri(image_tools.trim_transparent(_png(img), padding=5))
    assert risultato.size == (31, 31)


def test_trim_immagine_tutta_trasparente_non_esplode() -> None:
    img = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    assert image_tools.trim_transparent(_png(img)) == _png(img)


# ---------------------------------------------------------------------------
# Token circolare
# ---------------------------------------------------------------------------

def test_token_circolare_ha_angoli_trasparenti() -> None:
    img = Image.new("RGBA", (100, 100), (200, 50, 50, 255))
    risultato = _apri(image_tools.make_circular_token(_png(img), size=256, border_width=0))

    assert risultato.size == (256, 256)
    assert risultato.getpixel((3, 3))[3] == 0, "fuori dal cerchio deve essere trasparente"
    assert risultato.getpixel((128, 128))[3] == 255, "il centro deve essere opaco"


def test_token_circolare_non_deforma_immagini_rettangolari() -> None:
    """Un ritratto 300x600 va rimpicciolito proporzionalmente, non schiacciato."""
    img = Image.new("RGBA", (300, 600), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle((0, 150, 300, 450), fill=(0, 200, 0, 255))

    risultato = _apri(image_tools.make_circular_token(_png(img), size=200, border_width=0))

    assert risultato.size == (200, 200)
    assert risultato.getpixel((100, 100))[:3] == (0, 200, 0)


def test_soggetto_verticale_non_viene_decapitato() -> None:
    """Regressione trovata guardando l'anteprima: il ritaglio quadrato
    centrale tagliava testa e piedi di un personaggio full-body."""
    img = Image.new("RGBA", (200, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((70, 10, 130, 70), fill=(255, 0, 0, 255))       # TESTA in cima
    d.rectangle((85, 70, 115, 520), fill=(0, 0, 255, 255))    # corpo
    d.rectangle((60, 520, 140, 590), fill=(0, 255, 0, 255))   # PIEDI in fondo

    risultato = _apri(image_tools.make_circular_token(_png(img), size=300, border_width=0))

    colori = {risultato.getpixel((x, y))[:3]
              for x in range(300) for y in range(300)
              if risultato.getpixel((x, y))[3] > 128}
    assert (255, 0, 0) in colori, "la testa non deve sparire"
    assert (0, 255, 0) in colori, "i piedi non devono sparire"


def test_bordo_disegnato_sul_perimetro() -> None:
    img = Image.new("RGBA", (100, 100), (255, 255, 255, 255))
    colore = (10, 20, 30, 255)
    risultato = _apri(
        image_tools.make_circular_token(_png(img), size=200, border_width=8, border_color=colore)
    )
    # sul bordo sinistro del cerchio, a metà altezza
    assert risultato.getpixel((4, 100))[:3] == colore[:3]
    assert risultato.getpixel((100, 100))[:3] == (255, 255, 255)


def test_token_conserva_la_trasparenza_gia_presente() -> None:
    """Se lo sfondo è già stato rimosso, il cerchio non deve 'riempirlo'."""
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse((30, 30, 70, 70), fill=(255, 0, 0, 255))

    risultato = _apri(image_tools.make_circular_token(_png(img), size=100, border_width=0))

    # punto dentro il cerchio della maschera ma fuori dal soggetto
    assert risultato.getpixel((20, 50))[3] == 0
    assert risultato.getpixel((50, 50))[3] == 255


def test_pipeline_completa_token_vtt(soggetto_su_sfondo_uniforme: bytes) -> None:
    """Da PNG quadrato con sfondo a token circolare trasparente."""
    risultato = _apri(
        image_tools.prepare_vtt_token(soggetto_su_sfondo_uniforme, size=256, border_width=4)
    )
    assert risultato.size == (256, 256)
    assert risultato.getpixel((2, 2))[3] == 0
    assert risultato.getpixel((128, 128))[3] == 255


def test_pipeline_con_passaggi_disattivati(soggetto_su_sfondo_uniforme: bytes) -> None:
    risultato = _apri(
        image_tools.prepare_vtt_token(
            soggetto_su_sfondo_uniforme, remove_bg=False, circular=False
        )
    )
    assert risultato.getpixel((2, 2))[3] == 255, "senza rimozione sfondo resta opaco"


def test_soggetto_non_viene_tagliato_dal_cerchio() -> None:
    """Regressione (vista a occhio su un'anteprima): un soggetto che riempiva
    il quadrato veniva decapitato dalla maschera circolare."""
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    # soggetto che tocca i bordi alto e basso del riquadro
    ImageDraw.Draw(img).rectangle((40, 0, 60, 99), fill=(255, 0, 0, 255))

    risultato = _apri(image_tools.make_circular_token(_png(img), size=200, border_width=0))

    colonna_centrale = [risultato.getpixel((100, y))[3] for y in range(200)]
    pixel_opachi = sum(1 for a in colonna_centrale if a > 200)
    # con content_scale=0.86 il soggetto sta dentro: ~172 px su 200 di altezza
    assert pixel_opachi > 150, f"soggetto tagliato: solo {pixel_opachi}px opachi in colonna"


def test_content_scale_uno_riempie_il_cerchio() -> None:
    img = Image.new("RGBA", (100, 100), (255, 0, 0, 255))
    risultato = _apri(
        image_tools.make_circular_token(_png(img), size=100, border_width=0, content_scale=1.0)
    )
    assert risultato.getpixel((50, 2))[3] > 200, "a scala piena il soggetto tocca il bordo"
