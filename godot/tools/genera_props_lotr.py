# Props TEMATICI della Terra di Mezzo (Fase G4) — 6 PNG top-down 256x256 con alpha e ombra
# morbida, nello stile degli 8 prop inclusi. Finiscono in assets/props: entrano da soli nel
# catalogo della palette "🌳 Props" e, una volta piazzati, diventano COPERTURA tattica
# (pipeline props -> CoverManager gia' in piedi). Usati anche dall'ARREDO fisso del set
# (assets/maps_terra_di_mezzo/arredo.json).
#
# Uso:  python3 tools/genera_props_lotr.py

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

LATO = 256
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "props")
random.seed(20260716)


def tela():
    img = Image.new("RGBA", (LATO, LATO), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def ombra(img, raggio=86, offset=(10, 12), alpha=70):
    """Ombra morbida sotto il prop (luce da nord-ovest, coerente con l'hillshade)."""
    sh = Image.new("RGBA", (LATO, LATO), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    cx, cy = LATO // 2 + offset[0], LATO // 2 + offset[1]
    d.ellipse([cx - raggio, cy - raggio * 0.8, cx + raggio, cy + raggio * 0.8],
              fill=(10, 10, 10, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    sh.alpha_composite(img)
    return sh


def salva(img, nome):
    img.save(os.path.join(OUT, nome + ".png"), optimize=True)
    print("  •", nome + ".png")


def pino_rohan():
    """Pino delle praterie: corona conica vista dall'alto, anelli verdi con punte."""
    img, d = tela()
    cx = cy = LATO // 2
    for r, col in [(96, (34, 62, 34, 255)), (74, (44, 78, 40, 255)),
                   (52, (56, 94, 48, 255)), (30, (70, 110, 56, 255))]:
        punti = []
        for i in range(22):
            a = i / 22.0 * math.tau
            rr = r * (0.82 + 0.18 * ((i * 7) % 5) / 4.0)
            punti.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        d.polygon(punti, fill=col)
    d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(96, 74, 48, 255))
    return ombra(img)


def albero_atro():
    """Albero di Bosco Atro: chioma contorta quasi nera, rami come artigli."""
    img, d = tela()
    cx = cy = LATO // 2
    for i in range(9):
        a = i / 9.0 * math.tau + 0.3
        rr = 78 + (i % 3) * 14
        ex, ey = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        d.line([cx, cy, ex, ey], fill=(26, 30, 24, 255), width=14)
        d.ellipse([ex - 26, ey - 26, ex + 26, ey + 26], fill=(24, 34, 26, 235))
    d.ellipse([cx - 52, cy - 52, cx + 52, cy + 52], fill=(20, 28, 22, 255))
    d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=(46, 38, 30, 255))
    return ombra(img, alpha=90)


def rovina_antica():
    """Cerchio di pietre spezzate (un'antica torre di veglia crollata)."""
    img, d = tela()
    cx = cy = LATO // 2
    for i in range(12):
        if i in (2, 3, 8):
            continue  # brecce nel cerchio: e' una ROVINA
        a = i / 12.0 * math.tau
        bx, by = cx + math.cos(a) * 84, cy + math.sin(a) * 84
        w = 16 + (i % 3) * 5
        col = (150, 146, 136, 255) if i % 2 == 0 else (128, 124, 116, 255)
        d.rounded_rectangle([bx - w, by - 12, bx + w, by + 12], 5, fill=col,
                            outline=(86, 82, 76, 255), width=2)
    d.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=(112, 108, 100, 200))
    d.rectangle([cx - 8, cy - 46, cx + 12, cy - 12], fill=(140, 136, 126, 255))
    return ombra(img, raggio=100, alpha=60)


def guglia_mordor():
    """Guglia nera di Mordor: lama di ossidiana vista dall'alto, spigoli taglienti."""
    img, d = tela()
    cx = cy = LATO // 2
    punte = []
    for i in range(7):
        a = i / 7.0 * math.tau
        rr = 92 if i % 2 == 0 else 38
        punte.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d.polygon(punte, fill=(24, 22, 28, 255), outline=(10, 10, 12, 255))
    interne = [(cx + (px - cx) * 0.45, cy + (py - cy) * 0.45) for px, py in punte]
    d.polygon(interne, fill=(44, 40, 50, 255))
    d.line([cx - 20, cy - 20, cx + 8, cy + 4], fill=(90, 84, 104, 255), width=4)
    return ombra(img, alpha=100)


def masso_emyn():
    """Masso dell'Emyn Muil: gruppo di lastre grigie accatastate."""
    img, d = tela()
    for bx, by, r, col in [(110, 118, 62, (118, 114, 106, 255)),
                           (156, 132, 46, (132, 128, 120, 255)),
                           (122, 168, 40, (104, 100, 94, 255)),
                           (168, 172, 30, (144, 140, 132, 255))]:
        punti = []
        for i in range(8):
            a = i / 8.0 * math.tau + bx * 0.01
            rr = r * (0.8 + 0.2 * ((i * 5 + bx) % 4) / 3.0)
            punti.append((bx + math.cos(a) * rr, by + math.sin(a) * rr))
        d.polygon(punti, fill=col, outline=(70, 68, 64, 255))
    d.line([80, 96, 148, 150], fill=(160, 156, 148, 160), width=3)
    return ombra(img, raggio=92)


def ceppo_palude():
    """Ceppo morto delle Paludi: tronco spezzato e radici nell'acqua nera."""
    img, d = tela()
    cx = cy = LATO // 2
    d.ellipse([cx - 74, cy - 60, cx + 74, cy + 60], fill=(30, 36, 34, 190))
    for i in range(7):
        a = i / 7.0 * math.tau + 0.5
        ex, ey = cx + math.cos(a) * 66, cy + math.sin(a) * 52
        d.line([cx, cy, ex, ey], fill=(58, 48, 36, 255), width=9)
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], fill=(74, 60, 44, 255))
    d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(52, 42, 32, 255))
    d.arc([cx - 22, cy - 22, cx + 22, cy + 22], 20, 200, fill=(96, 82, 60, 255), width=2)
    return ombra(img, raggio=80, alpha=55)


def main():
    print("Genero i 6 props della Terra di Mezzo in", os.path.abspath(OUT))
    salva(pino_rohan(), "pino_rohan")
    salva(albero_atro(), "albero_atro")
    salva(rovina_antica(), "rovina_antica")
    salva(guglia_mordor(), "guglia_mordor")
    salva(masso_emyn(), "masso_emyn")
    salva(ceppo_palude(), "ceppo_palude")
    print("Fatto.")


if __name__ == "__main__":
    main()
