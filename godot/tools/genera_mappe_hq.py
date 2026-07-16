# Generatore HQ del Mondo cucito "Terra di Mezzo" (Fase G4).
#
# Genera il mondo INTERO (3072x3072) in un colpo solo — cosi' i bordi tra le tessere sono
# per costruzione PERFETTI (zero cuciture) — poi lo divide nelle 9 tessere mappa_01..09.png
# (1024x1024, stesse dimensioni delle attuali: etichette, regioni e arredo restano validi).
#
# Biomi ancorati alle REGIONI di gioco (stesse coordinate di etichette.json/regioni JSON):
#   Bosco Atro (500,480)          foresta fitta e scura         Campi di Rohan (1600,380) praterie
#   Nen Hithoel (2600,430)        lago + fiume verso sud        Soglie di Moria (500,1500) montagne
#   Brea (1536,1380)              colline + villaggio           Guado di Bruinen (2720,1470) fiume
#   Emyn Muil (460,2620)          labirinto roccioso            Pelennor (1500,2620) campi bruciati
#   Paludi Morte (2620,2720)      acquitrino                    Cirith Ungol (2950,2400) + Morannon
#   (900,2950)                    terre di Mordor: cenere
# Piu': la Grande Via Est (Brea->Guado), la via del sud (Rohan->Pelennor), fiume dal lago alle
# paludi, hillshade da nord-ovest, texture di dettaglio (erba, chiome, rocce, braci).
#
# Uso:  python3 tools/genera_mappe_hq.py   (sovrascrive assets/maps_terra_di_mezzo/mappa_*.png)

import numpy as np
from PIL import Image
import os

RNG = np.random.default_rng(20260716)
LATO = 3072
TILE = 1024
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "maps_terra_di_mezzo")


# ---------- rumore frattale (value noise bilineare, multi-ottava) ----------

def _griglia(passo, seed):
    r = np.random.default_rng(seed)
    g = r.random(((LATO // passo) + 2, (LATO // passo) + 2))
    y, x = np.mgrid[0:LATO, 0:LATO]
    gx, gy = x / passo, y / passo
    x0, y0 = gx.astype(int), gy.astype(int)
    fx, fy = gx - x0, gy - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = g[y0, x0]
    b = g[y0, x0 + 1]
    c = g[y0 + 1, x0]
    d = g[y0 + 1, x0 + 1]
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


def fbm(passo_base, ottave, seed):
    tot = np.zeros((LATO, LATO))
    amp, somma = 1.0, 0.0
    for o in range(ottave):
        tot += amp * _griglia(max(4, passo_base >> o), seed + o * 101)
        somma += amp
        amp *= 0.5
    return tot / somma


def blob(cx, cy, raggio):
    """Campo radiale morbido 1->0 attorno a un centro (per i biomi delle regioni)."""
    y, x = np.mgrid[0:LATO, 0:LATO]
    d = np.hypot(x - cx, y - cy) / raggio
    return np.clip(1.0 - d, 0.0, 1.0) ** 1.5


def dist_polilinea(punti, larghezza_noise=None):
    """Distanza (in px) di ogni pixel dalla polilinea; per fiumi e strade."""
    y, x = np.mgrid[0:LATO, 0:LATO]
    d = np.full((LATO, LATO), 1e9)
    for (x1, y1), (x2, y2) in zip(punti[:-1], punti[1:]):
        vx, vy = x2 - x1, y2 - y1
        ll = max(1.0, vx * vx + vy * vy)
        t = np.clip(((x - x1) * vx + (y - y1) * vy) / ll, 0.0, 1.0)
        d = np.minimum(d, np.hypot(x - (x1 + t * vx), y - (y1 + t * vy)))
    if larghezza_noise is not None:
        d = d + larghezza_noise
    return d


def main():
    print("Genero i campi globali (rumore, quota, umidita')...")
    warp = (fbm(256, 4, 7) - 0.5) * 220.0          # domain warp: confini organici
    quota = fbm(512, 6, 1)                          # elevazione di base
    umido = fbm(384, 5, 2)
    dettaglio = fbm(24, 3, 3)                       # micro-texture (erba, sassi)
    chiome = fbm(48, 4, 4)                          # clumping degli alberi

    y, x = np.mgrid[0:LATO, 0:LATO]
    xw, yw = x + warp, y + warp                     # coordinate deformate per i biomi

    # --- maschere di bioma (ancorate alle regioni di gioco) ---
    def blobw(cx, cy, r):
        d = np.hypot(xw - cx, yw - cy) / r
        return np.clip(1.0 - d, 0.0, 1.0) ** 1.5

    bosco = blobw(500, 480, 700)
    prateria = blobw(1600, 380, 720)
    lago = blobw(2600, 430, 330)
    monti = blobw(380, 1500, 760) + np.clip((250 - xw) / 250, 0, 1) * 0.7
    colline = blobw(1536, 1380, 640)
    guado = blobw(2720, 1470, 420)
    emyn = blobw(460, 2620, 620)
    pelennor = blobw(1500, 2620, 600)
    paludi = blobw(2620, 2720, 560)
    mordor = blobw(900, 2950, 560) + blobw(2950, 2400, 480) + \
        np.clip((yw - 2650) / 400, 0, 1) * 0.65
    mordor = np.clip(mordor, 0, 1.4)

    # quota modellata: monti alti, paludi/lago depressi, Emyn Muil crestoso
    creste = np.abs(fbm(96, 4, 9) - 0.5) * 2.0      # ridge noise per l'Emyn Muil
    quota = quota + monti * 0.55 + emyn * creste * 0.5 - paludi * 0.35 - lago * 0.6 \
        - pelennor * 0.15 + mordor * 0.1

    # --- acqua: lago + fiume (dal lago, per il Guado, giu' alle Paludi) ---
    fiume_pts = [(2600, 520), (2680, 900), (2740, 1470), (2660, 2000),
                 (2600, 2400), (2620, 2720)]
    larg = (fbm(128, 3, 11) - 0.5) * 26.0
    d_fiume = dist_polilinea(fiume_pts, larg)
    acqua = (lago > 0.55) | (d_fiume < 26)
    riva = ((lago > 0.42) | (d_fiume < 44)) & ~acqua

    # --- strade: la Grande Via Est e la via del sud ---
    via_est = dist_polilinea([(1536, 1380), (2000, 1400), (2400, 1430), (2740, 1470)], larg * 0.4)
    via_sud = dist_polilinea([(1600, 420), (1560, 900), (1536, 1380), (1500, 1900),
                              (1480, 2300), (1500, 2620)], larg * 0.4)
    strada = ((via_est < 13) | (via_sud < 13)) & ~acqua

    print("Compongo i colori dei biomi...")
    # base: erba con due toni guidati da umidita' + dettaglio
    base = np.zeros((LATO, LATO, 3))
    erba_secca = np.array([118, 116, 68])
    erba_verde = np.array([86, 108, 62])
    t = np.clip(umido * 0.7 + dettaglio * 0.3, 0, 1)[..., None]
    base = erba_secca * (1 - t) + erba_verde * t

    def dipingi(maschera, colore, forza=1.0):
        m = np.clip(maschera * forza, 0, 1)[..., None]
        return base * (1 - m) + np.array(colore) * m

    base = dipingi(prateria * 0.95, [134, 132, 64])                     # praterie dorate di Rohan
    base = dipingi(prateria * 0.5 * (dettaglio > 0.55), [146, 140, 70])  # ciuffi d'erba alta
    base = dipingi(colline * 0.55, [104, 112, 64])                      # colline di Brea
    base = dipingi(pelennor * 0.75, [128, 118, 74])                     # campi del Pelennor
    # foresta: chiome a grumi (due verdi + ombra)
    foresta_m = np.clip(bosco * 1.2, 0, 1) * (chiome > 0.45)
    base = dipingi(foresta_m, [38, 58, 34])
    base = dipingi(np.clip(bosco * 1.2, 0, 1) * (chiome > 0.62), [52, 76, 42])
    # rocce: monti + Emyn Muil, grigio con striature
    roccia_m = np.clip(monti * 1.1, 0, 1)
    base = dipingi(roccia_m * (quota > 0.55), [116, 112, 104])
    base = dipingi(roccia_m * (quota > 0.8), [214, 214, 218])           # nevai
    base = dipingi(np.clip(emyn, 0, 1) * (creste > 0.55), [98, 94, 88])
    # paludi: mottling scuro + pozze nere (piu' cupe e riconoscibili)
    base = dipingi(np.clip(paludi * 1.3, 0, 1), [56, 66, 48])
    base = dipingi(np.clip(paludi * 1.1, 0, 1) * (umido > 0.55), [30, 36, 34])
    base = dipingi(np.clip(paludi, 0, 1) * (dettaglio > 0.72), [82, 88, 58], 0.8)  # canneti
    # Mordor: cenere e crosta nera con crepe
    base = dipingi(np.clip(mordor, 0, 1), [52, 46, 44])
    crepe = np.abs(fbm(64, 4, 13) - 0.5) < 0.02
    base = dipingi(np.clip(mordor, 0, 1) * crepe, [140, 62, 24], 0.9)   # crepe di brace
    # campi coltivati a strisce attorno a Brea e al Pelennor (prima della guerra...)
    strisce = ((x // 96 + y // 96) % 2 == 0)
    base = dipingi(colline * 0.3 * strisce, [122, 120, 72])
    bruciato = np.clip(pelennor, 0, 1) * (fbm(160, 3, 14) > 0.66)
    base = dipingi(bruciato, [58, 50, 44])                              # chiazze di battaglia

    # acqua e rive
    prof = np.clip((0.55 - lago) * 2 + d_fiume / 60.0, 0, 1)
    col_acqua = np.array([30, 52, 74]) * (1 - prof[..., None] * 0.4) \
        + np.array([44, 74, 96]) * (prof[..., None] * 0.4)
    base = np.where(acqua[..., None], col_acqua, base)
    base = np.where(riva[..., None], np.array([140, 132, 100]), base)
    base = np.where(strada[..., None], np.array([133, 116, 84]), base)

    # --- hillshade da nord-ovest + vignettatura leggera dei biomi scuri ---
    gyy, gxx = np.gradient(quota * 340.0)
    ombra = np.clip(0.78 + (-gxx - gyy) * 0.35, 0.55, 1.25)
    base = base * ombra[..., None]
    # micro-dettaglio finale (grana d'erba/sasso)
    base = base * (0.94 + dettaglio[..., None] * 0.12)

    # --- villaggio di Brea: casette col tetto attorno al centro ---
    print("Costruisco Brea, il Morannon e Cirith Ungol...")
    img = np.clip(base, 0, 255).astype(np.uint8)
    case = RNG
    for _ in range(26):
        ang = case.random() * 6.283
        rr = 40 + case.random() * 150
        cx, cy = int(1536 + np.cos(ang) * rr), int(1380 + np.sin(ang) * rr * 0.7)
        w, h = int(10 + case.random() * 10), int(8 + case.random() * 8)
        img[cy - h:cy + h, cx - w:cx + w] = (92, 74, 58)       # muri
        img[cy - h:cy, cx - w:cx + w] = (134, 64, 44)          # tetto (meta' nord)
    # Morannon: il muro nero tra le guglie
    img[2900:2925, 760:1050] = (28, 26, 30)
    img[2880:2900, 830:980] = (40, 36, 42)
    # Cirith Ungol: guglie scure (triangoli approssimati a colonne decrescenti)
    for gx0, gy0 in [(2905, 2360), (2950, 2400), (2995, 2430)]:
        for i in range(26):
            img[gy0 - i:gy0 - i + 2, gx0 + i // 3:gx0 + 24 - i // 3] = (30, 28, 34)

    print("Salvo le 9 tessere...")
    intera = Image.fromarray(img, "RGB")
    n = 1
    for r in range(3):
        for c in range(3):
            tile = intera.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
            tile.save(os.path.join(OUT, "mappa_%02d.png" % n), optimize=True)
            n += 1
    print("Fatto: 9 tessere HQ senza cuciture in", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
