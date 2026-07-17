# RITRATTI dei token v2 (H5) — busti DIPINTI in stile flat-painterly al posto dei distintivi:
# per ogni personaggio un tondo con fondale a gradiente radiale nel suo colore, busto in
# silhouette a strati (cappucci, elmi, teschi, musi di bestia, fiamme...), LUCE DI BORDO da
# sinistra-alto, occhi che brillano per i non-morti, vignetta e grana pittorica. Zero asset
# esterni, zero licenze: tutto PIL. Sovrascrive assets/tokens/<id>.png (256x256); i PNG
# dell'utente in user://tokens continuano a vincere su questi.
#
# Uso:  python3 tools/genera_ritratti_token.py

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

L = 256
C = L // 2
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "tokens")
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(20260717)


# --- Tavolozza di base ---

def scurisci(c, f):
    return tuple(int(v * f) for v in c[:3])


def schiarisci(c, f):
    return tuple(min(255, int(v + (255 - v) * f)) for v in c[:3])


def base_tondo(colore_fondo):
    """Fondale: gradiente radiale scuro nel colore del personaggio + cornice."""
    y, x = np.mgrid[0:L, 0:L].astype(float)
    d = np.sqrt((x - C) ** 2 + (y - C * 0.9) ** 2) / (C * 1.15)
    grad = np.clip(1.15 - d * 1.05, 0.0, 1.0) ** 1.6
    img = np.zeros((L, L, 4), dtype=np.uint8)
    for i in range(3):
        img[..., i] = (colore_fondo[i] * grad + 8).clip(0, 255)
    # maschera tonda
    dentro = np.sqrt((x - C) ** 2 + (y - C) ** 2) <= C - 3
    img[..., 3] = np.where(dentro, 255, 0)
    pil = Image.fromarray(img, "RGBA")
    d2 = ImageDraw.Draw(pil)
    d2.ellipse([2, 2, L - 2, L - 2], outline=(16, 13, 10, 255), width=6)
    d2.ellipse([6, 6, L - 6, L - 6], outline=(140, 108, 44, 220), width=3)
    return pil


def strato():
    img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def rim_light(sagoma, colore=(255, 236, 190), forza=110):
    """Luce di bordo: la silhouette spostata giu'-destra sottratta a se' stessa = bordo alto-sx."""
    a = np.array(sagoma.split()[3], dtype=np.int16)
    sotto = np.roll(np.roll(a, 3, axis=0), 3, axis=1)
    bordo = np.clip(a - sotto, 0, 255).astype(np.uint8)
    luce = Image.new("RGBA", (L, L), colore + (0,))
    luce.putalpha(Image.fromarray((bordo * (forza / 255.0)).astype(np.uint8)))
    return luce


def grana(img, forza=9):
    """Grana pittorica: rumore luminoso leggero solo dove c'e' alpha."""
    arr = np.array(img).astype(np.int16)
    rumore = RNG.integers(-forza, forza + 1, size=(L, L, 1))
    arr[..., :3] = np.clip(arr[..., :3] + rumore, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def vignetta(img):
    y, x = np.mgrid[0:L, 0:L].astype(float)
    d = np.sqrt((x - C) ** 2 + (y - C) ** 2) / C
    scuro = np.clip((d - 0.68) * 1.6, 0, 1) * 0.55
    arr = np.array(img).astype(np.float32)
    arr[..., :3] *= (1.0 - scuro[..., None])
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def occhi(d, colore, y=118, dx=26, r=7, bagliore=True):
    for sx in (-1, 1):
        cx = C + sx * dx
        if bagliore:
            for rr, aa in ((r * 2.2, 60), (r * 1.5, 110)):
                d.ellipse([cx - rr, y - rr, cx + rr, y + rr], fill=colore + (aa,))
        d.ellipse([cx - r, y - r * 0.6, cx + r, y + r * 0.6], fill=colore + (255,))


# --- Pezzi di busto (ognuno disegna su uno strato e lo ritorna) ---

def busto_spalle(d, colore, y_spalle=190, larg=100):
    d.polygon([(C - larg, L), (C - larg + 18, y_spalle), (C, y_spalle - 16),
               (C + larg - 18, y_spalle), (C + larg, L)], fill=colore + (255,))


def testa_tonda(d, colore, y=112, r=44):
    d.ellipse([C - r, y - r, C + r, y + r * 1.15], fill=colore + (255,))


def cappuccio(d, colore, y=104, larg=64):
    d.polygon([(C, y - 66), (C - larg, y + 40), (C - larg + 10, y + 74), (C - 20, y + 52),
               (C + 20, y + 52), (C + larg - 10, y + 74), (C + larg, y + 40)],
              fill=colore + (255,))
    d.ellipse([C - 34, y - 6, C + 34, y + 58], fill=(14, 11, 10, 255))  # il buio dentro


def elmo(d, colore, y=104, cresta=None):
    d.ellipse([C - 42, y - 48, C + 42, y + 34], fill=colore + (255,))
    d.rectangle([C - 42, y - 6, C + 42, y + 30], fill=colore + (255,))
    d.rectangle([C - 6, y - 10, C + 6, y + 34], fill=scurisci(colore, 0.4) + (255,))  # nasale
    for sx in (-1, 1):  # feritoie in ombra
        d.ellipse([C + sx * 26 - 12, y + 2, C + sx * 26 + 8, y + 18], fill=(12, 10, 9, 255))
    if cresta:
        d.polygon([(C - 4, y - 78), (C + 4, y - 78), (C + 10, y - 40), (C - 10, y - 40)],
                  fill=cresta + (255,))


def corna(d, colore, y=78, ampiezza=64, su=54):
    for sx in (-1, 1):
        d.line([(C + sx * 28, y), (C + sx * ampiezza, y - su * 0.55),
                (C + sx * (ampiezza - 10), y - su)], fill=colore + (255,), width=13)


def barba(d, colore, y=138, larg=34, lung=52):
    d.polygon([(C - larg, y), (C + larg, y), (C + larg * 0.4, y + lung), (C, y + lung + 12),
               (C - larg * 0.4, y + lung)], fill=colore + (255,))


def teschio(d, y=112):
    osso = (216, 208, 190)
    d.ellipse([C - 42, y - 44, C + 42, y + 30], fill=osso + (255,))
    d.rectangle([C - 26, y + 16, C + 26, y + 52], fill=osso + (255,))
    for sx in (-1, 1):
        d.ellipse([C + sx * 24 - 13, y - 12, C + sx * 24 + 13, y + 12], fill=(10, 8, 8, 255))
    d.polygon([(C, y + 8), (C - 7, y + 24), (C + 7, y + 24)], fill=(10, 8, 8, 255))
    for i in range(-2, 3):  # denti
        d.rectangle([C + i * 10 - 3, y + 34, C + i * 10 + 3, y + 50], fill=(10, 8, 8, 255))


def zanne(d, y=150, dx=22):
    for sx in (-1, 1):
        d.polygon([(C + sx * dx - 5, y), (C + sx * dx + 5, y), (C + sx * dx, y - 16)],
                  fill=(232, 226, 205, 255))


def orecchie_a_punta(d, colore, y=100, dx=46, lung=30):
    for sx in (-1, 1):
        d.polygon([(C + sx * dx, y), (C + sx * (dx + lung), y - 18), (C + sx * dx, y + 18)],
                  fill=colore + (255,))


def muso_lupo(d, colore, y=120):
    d.polygon([(C - 46, y - 40), (C + 46, y - 40), (C + 26, y + 30), (C, y + 52),
               (C - 26, y + 30)], fill=colore + (255,))
    for sx in (-1, 1):  # orecchie
        d.polygon([(C + sx * 26, y - 36), (C + sx * 52, y - 78), (C + sx * 8, y - 52)],
                  fill=colore + (255,))
    d.ellipse([C - 9, y + 34, C + 9, y + 50], fill=(12, 10, 10, 255))  # tartufo


def ragno_testa(d, colore, y=120):
    d.ellipse([C - 52, y - 20, C + 52, y + 66], fill=colore + (255,))   # cefalotorace
    d.ellipse([C - 34, y - 52, C + 34, y + 6], fill=scurisci(colore, 0.8) + (255,))
    for sx in (-1, 1):  # cheliceri e zampe alte
        d.polygon([(C + sx * 12, y + 52), (C + sx * 22, y + 84), (C + sx * 4, y + 62)],
                  fill=scurisci(colore, 0.55) + (255,))
        for k in range(3):
            x0 = C + sx * (30 + k * 4)
            d.line([(x0, y - 8 + k * 18), (x0 + sx * 62, y - 46 + k * 26),
                    (x0 + sx * 88, y - 10 + k * 30)], fill=scurisci(colore, 0.7) + (255,), width=9)


def fiamme(img, y_base=210, colore=(255, 130, 30), n=7):
    d = ImageDraw.Draw(img)
    for i in range(n):
        x = C + (i - n // 2) * 26 + int(RNG.integers(-8, 9))
        h = 70 + int(RNG.integers(0, 50))
        d.polygon([(x - 14, y_base), (x, y_base - h), (x + 14, y_base)], fill=colore + (200,))
        d.polygon([(x - 7, y_base), (x, y_base - h * 0.65), (x + 7, y_base)],
                  fill=(255, 220, 120, 230))
    return img.filter(ImageFilter.GaussianBlur(1.4))


def tentacoli(d, colore, y=150):
    for i, sx in enumerate((-1, -0.55, 0.55, 1)):
        x0 = C + int(sx * 60)
        d.line([(x0, L), (x0 + int(sx * 24), y), (C + int(sx * 88), y - 66 - i % 2 * 22)],
               fill=colore + (255,), width=18 - i % 2 * 4)


# --- La scheda dei personaggi: fondo, pelle, vestito, extra ---

def ritratto(spec):
    fondo = spec.get("fondo", (52, 44, 38))
    img = base_tondo(fondo)
    corpo, d = strato()
    stile = spec["stile"]
    pelle = spec.get("pelle", (150, 120, 96))
    abito = spec.get("abito", (70, 58, 46))

    if stile == "eroe_elmo":
        busto_spalle(d, abito)
        elmo(d, pelle, cresta=spec.get("cresta"))
    elif stile == "eroe_cappuccio":
        busto_spalle(d, abito)
        cappuccio(d, abito)
    elif stile == "eroe_capelli":
        busto_spalle(d, abito)
        testa_tonda(d, pelle)
        d.polygon([(C - 52, 96), (C - 20, 46), (C + 20, 50), (C + 52, 100), (C + 40, 70),
                   (C - 40, 72)], fill=spec.get("capelli", (60, 44, 30)) + (255,))
        if spec.get("barba"):
            barba(d, spec["capelli"])
    elif stile == "mago":
        busto_spalle(d, abito)
        testa_tonda(d, pelle, y=120, r=38)
        barba(d, (208, 202, 192), y=142, larg=28, lung=58)
        # cappello a punta: falda ellittica + cono leggermente inclinato, col bordo in ombra
        d.ellipse([C - 58, 84, C + 58, 108], fill=scurisci(abito, 0.75) + (255,))
        d.polygon([(C - 36, 94), (C + 32, 94), (C + 12, 22)], fill=abito + (255,))
    elif stile == "goblinoide":
        busto_spalle(d, abito)
        testa_tonda(d, pelle, y=118, r=40)
        orecchie_a_punta(d, pelle)
        if spec.get("zanne"):
            zanne(d)
    elif stile == "cappa":
        busto_spalle(d, abito, larg=110)
        cappuccio(d, abito, larg=70)
    elif stile == "teschio":
        busto_spalle(d, abito, larg=86)
        teschio(d)
    elif stile == "lupo":
        muso_lupo(d, pelle)
    elif stile == "ragno":
        ragno_testa(d, pelle)
    elif stile == "demone":
        # il FUOCO sta DIETRO la sagoma: fiamme composte sullo strato, poi il corpo NERO sopra
        corpo.alpha_composite(fiamme(strato()[0], y_base=228,
                                     colore=spec.get("fuoco", (255, 130, 30)), n=9))
        busto_spalle(d, (16, 10, 8), larg=112, y_spalle=196)
        testa_tonda(d, (24, 14, 10), y=112, r=48)
        corna(d, (120, 96, 82), ampiezza=92, su=78)  # corna CHIARE: si stagliano sul fuoco
        for sx in (-1, 1):  # crepe di lava sul volto
            d.line([(C + sx * 20, 88), (C + sx * 34, 118), (C + sx * 16, 142)],
                   fill=(255, 120, 30, 200), width=3)
    elif stile == "tentacoli":
        tentacoli(d, pelle)

    if spec.get("corna_elmo"):
        corna(d, scurisci(pelle, 0.7))

    # luce di bordo + montaggio
    img.alpha_composite(corpo)
    img.alpha_composite(rim_light(corpo, spec.get("rim", (255, 236, 190))))

    sopra, d2 = strato()
    if "occhi" in spec:
        occhi(d2, spec["occhi"], y=spec.get("occhi_y", 118), bagliore=spec.get("bagliore", True))
    img.alpha_composite(sopra)
    if stile == "demone":
        # un velo di fiamme basse DAVANTI, per profondita' (il grosso del fuoco e' dietro)
        img.alpha_composite(fiamme(strato()[0], y_base=254, n=5,
                                   colore=spec.get("fuoco", (255, 130, 30))))
    img = grana(vignetta(img))
    # la maschera tonda finale (la grana non deve sporcare fuori dal tondo)
    mask = Image.new("L", (L, L), 0)
    ImageDraw.Draw(mask).ellipse([2, 2, L - 2, L - 2], fill=255)
    img.putalpha(Image.composite(img.split()[3], Image.new("L", (L, L), 0), mask))
    return img


PERSONAGGI = {
    # --- Eroi (per classe) ---
    "guerriero": { "stile": "eroe_elmo", "fondo": (46, 52, 66), "pelle": (150, 150, 162),
                   "abito": (88, 30, 26), "cresta": (170, 40, 34) },
    "barbaro":   { "stile": "eroe_capelli", "fondo": (66, 44, 30), "pelle": (168, 122, 92),
                   "capelli": (92, 52, 28), "abito": (96, 66, 40), "barba": True },
    "ladro":     { "stile": "eroe_cappuccio", "fondo": (36, 40, 36), "abito": (44, 48, 44),
                   "occhi": (200, 210, 190), "bagliore": False, "occhi_y": 116 },
    "ranger":    { "stile": "eroe_cappuccio", "fondo": (34, 52, 38), "abito": (44, 74, 48),
                   "occhi": (210, 220, 180), "bagliore": False },
    "mago":      { "stile": "mago", "fondo": (40, 40, 68), "pelle": (188, 158, 130),
                   "abito": (56, 56, 110) },
    "chierico":  { "stile": "eroe_elmo", "fondo": (72, 62, 34), "pelle": (196, 178, 130),
                   "abito": (150, 128, 66), "cresta": (230, 208, 130) },
    # --- Umanoidi ostili ---
    "goblin":        { "stile": "goblinoide", "fondo": (38, 52, 30), "pelle": (96, 128, 60),
                       "abito": (60, 52, 36), "occhi": (240, 210, 60) },
    "goblin-moria":  { "stile": "goblinoide", "fondo": (32, 38, 40), "pelle": (86, 108, 74),
                       "abito": (48, 46, 50), "occhi": (250, 190, 60) },
    "orc":           { "stile": "goblinoide", "fondo": (48, 40, 30), "pelle": (110, 96, 58),
                       "abito": (66, 48, 34), "occhi": (230, 120, 50), "zanne": True },
    "orco-isengard": { "stile": "goblinoide", "fondo": (40, 36, 34), "pelle": (98, 84, 58),
                       "abito": (52, 48, 46), "occhi": (240, 140, 50), "zanne": True },
    "uruk-hai":      { "stile": "eroe_elmo", "fondo": (34, 30, 28), "pelle": (70, 62, 54),
                       "abito": (58, 42, 34), "occhi": (240, 150, 50) },
    "capitano-uruk-hai": { "stile": "eroe_elmo", "fondo": (40, 30, 26), "pelle": (76, 62, 50),
                       "abito": (86, 40, 30), "cresta": (200, 190, 180), "occhi": (250, 160, 50) },
    "hobgoblin":     { "stile": "goblinoide", "fondo": (54, 34, 30), "pelle": (140, 84, 60),
                       "abito": (78, 50, 38), "occhi": (250, 200, 80), "zanne": True },
    "bandit":        { "stile": "eroe_cappuccio", "fondo": (44, 40, 34), "abito": (72, 58, 40),
                       "occhi": (220, 200, 170), "bagliore": False },
    "corsaro-umbar": { "stile": "eroe_capelli", "fondo": (30, 40, 50), "pelle": (140, 104, 76),
                       "capelli": (30, 26, 24), "abito": (46, 58, 76), "barba": True },
    "uomo-selvaggio":{ "stile": "eroe_capelli", "fondo": (50, 42, 28), "pelle": (146, 110, 80),
                       "capelli": (70, 50, 30), "abito": (84, 64, 40), "barba": True },
    "cultist":       { "stile": "cappa", "fondo": (38, 34, 44), "abito": (58, 52, 70),
                       "occhi": (200, 170, 240) },
    "arciere-haradrim": { "stile": "cappa", "fondo": (60, 36, 26), "abito": (130, 52, 38),
                       "occhi": (240, 210, 160), "bagliore": False },
    "grima-vermilinguo": { "stile": "eroe_capelli", "fondo": (36, 36, 40), "pelle": (196, 188, 178),
                       "capelli": (28, 26, 26), "abito": (44, 44, 52) },
    "saruman-bianco":{ "stile": "mago", "fondo": (56, 56, 60), "pelle": (200, 188, 172),
                       "abito": (208, 204, 198) },
    "bocca-di-sauron": { "stile": "eroe_elmo", "fondo": (28, 24, 26), "pelle": (44, 40, 44),
                       "abito": (38, 32, 36), "occhi": (0, 0, 0), "bagliore": False },
    # --- Non morti e spettri ---
    "skeleton":      { "stile": "teschio", "fondo": (38, 38, 34), "abito": (60, 56, 48),
                       "occhi": (120, 220, 160), "occhi_y": 106 },
    "zombie":        { "stile": "goblinoide", "fondo": (36, 44, 34), "pelle": (110, 128, 96),
                       "abito": (58, 60, 48), "occhi": (200, 230, 150), "bagliore": False },
    "spettro-palude":{ "stile": "cappa", "fondo": (26, 38, 38), "abito": (60, 90, 88),
                       "occhi": (150, 240, 220), "rim": (170, 240, 220) },
    "re-stregoni-angmar": { "stile": "cappa", "fondo": (24, 22, 30), "abito": (30, 28, 38),
                       "occhi": (255, 120, 40), "corna_elmo": True, "pelle": (120, 110, 120),
                       "rim": (180, 170, 220) },
    # --- Bestie e mostri grandi ---
    "wolf":          { "stile": "lupo", "fondo": (36, 38, 44), "pelle": (96, 92, 96),
                       "occhi": (250, 200, 60), "occhi_y": 102 },
    "shelob":        { "stile": "ragno", "fondo": (30, 26, 30), "pelle": (52, 42, 44),
                       "occhi": (220, 60, 60), "occhi_y": 116 },
    "drago-montagne-grigie": { "stile": "lupo", "fondo": (40, 44, 50), "pelle": (110, 118, 126),
                       "occhi": (255, 170, 40), "occhi_y": 102, "corna_elmo": True },
    "guardiano-acqua": { "stile": "tentacoli", "fondo": (22, 36, 44), "pelle": (52, 92, 96),
                       "occhi": (170, 240, 200), "occhi_y": 96 },
    "troll-caverne": { "stile": "goblinoide", "fondo": (44, 44, 46), "pelle": (120, 122, 118),
                       "abito": (70, 70, 66), "occhi": (220, 200, 120), "zanne": True },
    "balrog":        { "stile": "demone", "fondo": (36, 18, 12), "occhi": (255, 190, 60),
                       "occhi_y": 106, "fuoco": (255, 120, 26), "rim": (255, 160, 60) },
}

# I 9 Nazgul: la stessa ombra incoronata di buio, in nove sfumature di tenebra.
NAZGUL = ["nazgul-khamul", "nazgul-dwar", "nazgul-ji-indur", "nazgul-akhorahil",
          "nazgul-hoarmurath", "nazgul-adunaphel", "nazgul-ren", "nazgul-uvatha"]
for i, nid in enumerate(NAZGUL):
    PERSONAGGI[nid] = {
        "stile": "cappa", "fondo": (22 + i % 3 * 4, 20, 30 + i % 4 * 4),
        "abito": (26 + i % 3 * 5, 24, 34 + i % 4 * 5),
        "occhi": (255, 90 + i % 4 * 25, 30), "rim": (150, 140, 200),
    }


def main():
    print(f"Dipingo {len(PERSONAGGI)} ritratti in {os.path.abspath(OUT)}")
    for nome, spec in sorted(PERSONAGGI.items()):
        ritratto(spec).save(os.path.join(OUT, nome + ".png"), optimize=True)
        print(" ", nome)
    print("Fatto.")


if __name__ == "__main__":
    main()
