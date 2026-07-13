"""ROCCA DEL CONFINE — castello dungeon 3D per il VTT, da eseguire DENTRO Blender (4.x/5.x).

Costruisce una fortezza dark-fantasy COMPLETA e la renderizza dall'alto in DUE battlemap
pronte per il gioco (stessa scala, stessa impronta — le scale combaciano tra i livelli):
  1. castello_superficie.png — mura spesse con camminamento, 4 torri, corpo di guardia
     monumentale con ponte sul fossato, breccia di battaglia con macerie, cortile con pozzo
     e bracieri, caserma, armeria, e il MASTIO con la sala del trono (tutto SENZA TETTI:
     gli interni si leggono dall'alto, come una vera battlemap);
  2. castello_sotterraneo.png — il dungeon: corridoi larghi 2 celle, blocco prigione con
     celle sbarrate, corpo di guardia, catacombe con sarcofagi, camera rituale con cerchio
     runico, crollo che blocca un passaggio. Le DUE scale (cortile e retro-trono) hanno la
     STESSA posizione su entrambe le mappe: salire e scendere e' coerente al quadretto.

SCALA VTT: 1 cella = 1,5 m. L'inquadratura copre 96 m = 64 celle per lato; a 3072 px il
render fa 48 px/cella — perfetto per la griglia del VTT (128 px/cella nel Mondo cucito:
importalo e ridimensiona, o usa la griglia a 48). Leggibilita' PRIMA del dettaglio:
corridoi mai sotto le 2 celle, stanze rettangolari, porte evidenti, niente geometrie fitte.

COME USARLO: come gli altri script di questa cartella (Claude Desktop + Blender MCP:
"esegui questo script in Blender", oppure tab Scripting -> Run). Render in
Desktop/vtt_castello/. Con l'opzione Poly Haven ATTIVA nel pannello BlenderMCP puoi poi
chiedere a Claude Desktop di sostituire i materiali procedurali con texture CC0 vere
(vedi README.md, sezione castello).
"""
import math
import os
import random

import bpy

random.seed(20260714)
RES = 3072            # lato del render (px) -> 48 px/cella
CAMPO = 96.0          # metri inquadrati (64 celle da 1,5 m)
CELLA = 1.5
SAMPLES = 48
X_DUNGEON = 300.0     # il sotterraneo vive lontano sull'asse X e si renderizza a parte
CARTELLA_OUT = os.path.join(os.path.expanduser("~"), "Desktop", "vtt_castello")

# ---------------------------------------------------------------- materiali ---
_materiali = {}


def materiale(nome, colore, ruvido=0.9, emissione=None, forza=6.0, bump=0.0, metallo=0.0):
    if nome in _materiali:
        return _materiali[nome]
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    nt = mat.node_tree
    # Cerca per TIPO, non per nome: in Blender localizzato (es. italiano) il nome del nodo
    # creato automaticamente puo' essere tradotto ("Principled BSDF" -> altro), e nt.nodes.get()
    # per stringa fallirebbe silenziosamente ritornando None.
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    bsdf.inputs["Base Color"].default_value = (*colore, 1.0)
    bsdf.inputs["Roughness"].default_value = ruvido
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallo
    if emissione is not None:
        for k in ("Emission Color", "Emission"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = (*emissione, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = forza
    if bump > 0.0:
        rumore = nt.nodes.new("ShaderNodeTexNoise")
        rumore.inputs["Scale"].default_value = 14.0
        nodo_bump = nt.nodes.new("ShaderNodeBump")
        nodo_bump.inputs["Strength"].default_value = bump
        nt.links.new(rumore.outputs["Fac"], nodo_bump.inputs["Height"])
        nt.links.new(nodo_bump.outputs["Normal"], bsdf.inputs["Normal"])
    _materiali[nome] = mat
    return mat


def M():
    """I materiali del castello (creati pigramente, condivisi ovunque)."""
    return {
        "pietra": materiale("pietra", (0.30, 0.29, 0.27), 0.95, bump=0.35),
        "pietra_scura": materiale("pietra_scura", (0.17, 0.165, 0.16), 0.95, bump=0.3),
        "pavimento": materiale("pavimento", (0.36, 0.34, 0.31), 0.9, bump=0.2),
        "pav_dungeon": materiale("pav_dungeon", (0.22, 0.21, 0.20), 0.95, bump=0.25),
        "legno": materiale("legno", (0.16, 0.10, 0.06), 0.85, bump=0.15),
        "ferro": materiale("ferro", (0.09, 0.09, 0.10), 0.45, metallo=0.8),
        "acqua": materiale("acqua", (0.03, 0.06, 0.08), 0.12),
        "terra": materiale("terra", (0.11, 0.10, 0.08), 1.0, bump=0.2),
        "stoffa": materiale("stoffa", (0.30, 0.05, 0.05), 0.95),
        "oro": materiale("oro", (0.55, 0.42, 0.12), 0.35, metallo=0.9),
        "fiamma": materiale("fiamma", (1.0, 0.45, 0.08), 0.5,
                            emissione=(1.0, 0.42, 0.05), forza=18.0),
        "runa": materiale("runa", (0.35, 0.1, 0.5), 0.4,
                          emissione=(0.55, 0.15, 0.9), forza=8.0),
        "vuoto": materiale("vuoto", (0.005, 0.005, 0.008), 1.0),
    }


# ---------------------------------------------------------------- primitive ---
def box(x, y, w, d, h, mat, z=0.0, rot=0.0):
    """Parallelepipedo con BASE in z (comodo per muri e pavimenti)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + h / 2))
    ob = bpy.context.object
    ob.scale = (w, d, h)
    ob.rotation_euler.z = rot
    ob.data.materials.append(mat)
    return ob


def cilindro(x, y, r, h, mat, z=0.0, vertici=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=vertici,
                                        location=(x, y, z + h / 2))
    ob = bpy.context.object
    ob.data.materials.append(mat)
    return ob


def luce(x, y, z, energia=60.0, colore=(1.0, 0.6, 0.25), raggio=0.4):
    bpy.ops.object.light_add(type="POINT", location=(x, y, z))
    lp = bpy.context.object
    lp.data.energy = energia
    lp.data.color = colore
    lp.data.shadow_soft_size = raggio
    return lp


def torcia(x, y, z=2.2):
    """Torcia a muro: manico, fiamma emissiva e POZZA DI LUCE calda (leggibilita' di notte)."""
    m = M()
    cilindro(x, y, 0.06, 0.5, m["legno"], z=z - 0.4, vertici=8)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.14, location=(x, y, z + 0.2))
    bpy.context.object.data.materials.append(m["fiamma"])
    luce(x, y, z + 0.6, energia=45.0)


def braciere(x, y):
    m = M()
    cilindro(x, y, 0.55, 0.7, m["ferro"], vertici=12)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.35, location=(x, y, 0.85))
    bpy.context.object.data.materials.append(m["fiamma"])
    luce(x, y, 1.6, energia=90.0, raggio=0.6)


def merli(x0, y0, x1, y1, h_base, passo=2.0):
    """Merlatura lungo un segmento: blocchetti a passo regolare (leggibile, mai fitta)."""
    m = M()
    dx, dy = x1 - x0, y1 - y0
    lung = math.hypot(dx, dy)
    n = max(2, int(lung / passo))
    for i in range(n + 1):
        t = i / n
        box(x0 + dx * t, y0 + dy * t, 0.9, 0.9, 1.1, m["pietra_scura"], z=h_base)


def stendardo(x, y, z, rot=0.0):
    """Bandiera strappata: tre lembi di lunghezze diverse (silhouette lacera dall'alto/lato)."""
    m = M()
    for i, lembo in enumerate((-0.45, 0.0, 0.45)):
        lx = x + math.cos(rot) * lembo
        ly = y + math.sin(rot) * lembo
        box(lx, ly, 0.42, 0.06, 2.6 - abs(i - 1) * 0.7, m["stoffa"], z=z - 2.6, rot=rot)


def macerie(x, y, quante=8, raggio=2.2, seme=0):
    """Cumulo di pietre crollate (dettagli di battaglia, blocca i passaggi in modo LEGGIBILE)."""
    m = M()
    rnd = random.Random(seme)
    for _ in range(quante):
        a = rnd.random() * math.tau
        rr = rnd.random() * raggio
        dim = 0.4 + rnd.random() * 0.9
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1, radius=dim,
            location=(x + math.cos(a) * rr, y + math.sin(a) * rr, dim * 0.35))
        ob = bpy.context.object
        ob.scale.z = 0.55
        ob.data.materials.append(m["pietra_scura"])


def scala(x, y, larghezza, direzione, gradini=6):
    """Scalinata leggibile dall'alto: gradini degradanti verso il buio (giu') o l'ingresso."""
    m = M()
    for i in range(gradini):
        prof = 0.55
        off = i * prof
        z_alt = 0.12 * (gradini - i)
        if direzione == "giu":
            z_alt = 0.05  # verso il sotterraneo: piatta, sempre piu' scura la rende il buco
        dx, dy = (0, -off) if direzione in ("sud", "giu") else (0, off)
        box(x + dx, y + dy, larghezza, prof, z_alt,
            m["pietra_scura"] if i % 2 else m["pavimento"])
    if direzione == "giu":
        box(x, y - gradini * 0.55 / 2, larghezza, gradini * 0.55, 0.02, M()["vuoto"], z=0.3)


def porta_legno(x, y, larghezza, rot=0.0):
    m = M()
    box(x, y, larghezza, 0.25, 3.4, m["legno"], rot=rot)
    for spost in (-larghezza * 0.25, larghezza * 0.25):
        box(x + math.cos(rot) * spost, y + math.sin(rot) * spost,
            0.12, 0.3, 3.4, m["ferro"], rot=rot)


def sbarre(x0, y0, x1, y1, h=2.6, passo=0.5):
    """Inferriata di una cella: barre verticali lungo un segmento."""
    m = M()
    dx, dy = x1 - x0, y1 - y0
    n = max(2, int(math.hypot(dx, dy) / passo))
    for i in range(n + 1):
        t = i / n
        cilindro(x0 + dx * t, y0 + dy * t, 0.05, h, m["ferro"], vertici=6)
    box((x0 + x1) / 2, (y0 + y1) / 2, math.hypot(dx, dy), 0.08, 0.1, m["ferro"], z=h - 0.1,
        rot=math.atan2(dy, dx))


def stanza(x, y, w, d, mat_pav, spess=1.0, h=4.0, aperture=()):
    """Stanza SENZA TETTO: pavimento + 4 muri con varchi. aperture = lista di
    (lato 'n/s/e/o', offset dal centro del lato, larghezza varco)."""
    m = M()
    box(x, y, w, d, 0.25, mat_pav)
    lati = {
        "n": (x, y + d / 2, w, spess, 0.0),
        "s": (x, y - d / 2, w, spess, 0.0),
        "e": (x + w / 2, y, spess, d, 90.0),
        "o": (x - w / 2, y, spess, d, 90.0),
    }
    for lato, (mx, my, mw, md, _asse) in lati.items():
        varchi = sorted([(off, larg) for (l, off, larg) in aperture if l == lato])
        if not varchi:
            box(mx, my, mw, md, h, m["pietra"], z=0.25)
            continue
        # spezza il muro attorno ai varchi (solo lungo l'asse maggiore del lato)
        orizzontale = lato in ("n", "s")
        lunghezza = w if orizzontale else d
        cursore = -lunghezza / 2
        segmenti = []
        for off, larg in varchi:
            inizio = off - larg / 2
            if inizio > cursore:
                segmenti.append((cursore, inizio))
            cursore = off + larg / 2
        if cursore < lunghezza / 2:
            segmenti.append((cursore, lunghezza / 2))
        for a, b in segmenti:
            centro = (a + b) / 2
            estensione = b - a
            if estensione < 0.3:
                continue
            if orizzontale:
                box(x + centro, my, estensione, spess, h, m["pietra"], z=0.25)
            else:
                box(mx, y + centro, spess, estensione, h, m["pietra"], z=0.25)


# ------------------------------------------------------ LIVELLO SUPERFICIE ---
def costruisci_superficie():
    m = M()
    # terreno cupo + fossato a sud con ponte monumentale
    box(0, 0, CAMPO * 1.2, CAMPO * 1.2, 0.1, m["terra"], z=-0.1)
    box(0, -43.0, CAMPO * 1.2, 8.0, 0.12, m["acqua"], z=-0.06)    # bordo a -47: dentro i 48
    box(0, -42.5, 8.0, 10.0, 0.5, m["legno"])                     # ponte
    for lato in (-3.6, 3.6):
        for yy in range(-46, -38, 3):
            cilindro(lato, yy, 0.18, 1.2, m["legno"], vertici=8)  # parapetti del ponte

    # cinta muraria: quadrato 78x78, spessore 3, alta 9, con CAMMINAMENTO e merli su
    # entrambi i lati; varco del portale a sud (8 m) e BRECCIA di battaglia a est.
    half, spess, hmura = 39.0, 3.0, 9.0
    box(0, half, 2 * half + spess, spess, hmura, m["pietra"])                  # nord
    box(-(half / 2 + 6.5), -half, half - 13 + 6.5 * 2 - 8, spess, hmura, m["pietra"])  # sud ovest del varco
    box((half / 2 + 6.5), -half, half - 13 + 6.5 * 2 - 8, spess, hmura, m["pietra"])   # sud est del varco
    box(-half, 0, spess, 2 * half - spess, hmura, m["pietra"])                 # ovest
    box(half, 14, spess, 2 * half - spess - 28, hmura, m["pietra"])            # est (sopra la breccia)
    box(half, -26, spess, 22, hmura, m["pietra"])                              # est (sotto la breccia)
    macerie(half, -6, quante=14, raggio=4.5, seme=7)                           # la BRECCIA
    macerie(half - 5, -7, quante=8, raggio=3.0, seme=8)
    # camminamento: piano sottile sul filo interno delle mura + merli sui due bordi
    for x0, y0, x1, y1 in [(-half, half, half, half), (-half, -half, -half, half),
                           (half, -half + 26, half, half)]:
        merli(x0, y0, x1, y1, hmura)
    merli(-half, -half, -14, -half, hmura)
    merli(14, -half, half, -half, hmura)

    # 4 torri d'angolo alte, coi merli e lo stendardo strappato
    for tx, ty in [(-half, -half), (half, -half), (-half, half), (half, half)]:
        cilindro(tx, ty, 6.0, 15.0, m["pietra"])
        cilindro(tx, ty, 6.3, 0.6, m["pietra_scura"], z=15.0)
        for i in range(10):
            a = i * math.tau / 10
            box(tx + math.cos(a) * 6.0, ty + math.sin(a) * 6.0, 0.9, 0.9, 1.0,
                m["pietra_scura"], z=15.6)
        stendardo(tx, ty - 6.4, 15.0)
        torcia(tx, ty - 6.6, 5.0)

    # corpo di guardia monumentale: due torrioni ai lati del portale + porte massicce
    for gx in (-7.0, 7.0):
        cilindro(gx, -half, 4.5, 12.0, m["pietra"])
        for i in range(8):
            a = i * math.tau / 8
            box(gx + math.cos(a) * 4.5, -half + math.sin(a) * 4.5, 0.8, 0.8, 0.9,
                m["pietra_scura"], z=12.4)
        torcia(gx, -half + 4.8, 4.0)
    porta_legno(-2.1, -half, 4.0)
    porta_legno(2.1, -half, 4.0)
    sbarre(-3.8, -half + 1.8, 3.8, -half + 1.8, h=3.2, passo=0.75)  # saracinesca

    # cortile lastricato + pozzo, bracieri, botti, carro rotto
    box(0, -6, 66, 56, 0.2, m["pavimento"])
    cilindro(6, -8, 1.6, 1.0, m["pietra_scura"])
    cilindro(6, -8, 1.1, 1.05, m["vuoto"])
    for bx, by in [(-24, -30), (24, -30), (-24, 10), (24, 14)]:
        braciere(bx, by)
    for i, (cx, cy) in enumerate([(-10, -32), (-8.6, -32.6), (-9.4, -31)]):
        cilindro(cx, cy, 0.7, 1.1, m["legno"], vertici=10)
    box(14, -30, 3.4, 1.8, 1.0, m["legno"], rot=0.5)               # carro sfasciato
    cilindro(15.6, -29.2, 0.8, 0.2, m["legno"], z=0.4, vertici=10)
    macerie(-18, -6, quante=5, raggio=1.6, seme=21)

    # MASTIO con sala del trono (senza tetto: interni leggibili), scalinata d'accesso
    stanza(0, 22, 32, 20, m["pavimento"], spess=1.6, h=10.0,
           aperture=[("s", 0, 4.5), ("n", 12, 3.0)])
    scala(0, 10.2, 4.5, "sud", gradini=4)
    box(0, 22, 3.2, 16, 0.28, m["stoffa"])                          # tappeto rosso al trono
    box(0, 28.6, 8, 4, 0.9, m["pietra_scura"])                      # dais
    box(0, 29.6, 1.6, 1.0, 2.6, m["oro"], z=0.9)                    # il TRONO
    for cx in (-6.0, 6.0):
        for cy in (16.0, 21.0, 26.0):
            cilindro(cx, cy, 0.8, 9.0, m["pietra_scura"], vertici=12)
    for sx in (-9.0, -3.0, 3.0, 9.0):
        stendardo(sx, 31.2, 9.0)
    torcia(-14.5, 22, 3.0)
    torcia(14.5, 22, 3.0)
    braciere(-5, 27)
    braciere(5, 27)

    # caserma (ovest) e armeria (est), senza tetto, porte sul cortile
    stanza(-27, -2, 16, 12, m["pavimento"], aperture=[("e", 0, 3.0)])
    for by in (-5.5, -2.0, 1.5):
        box(-32, by, 4.5, 1.8, 0.7, m["legno"])                     # brande
    stanza(27, 0, 12, 12, m["pavimento"], aperture=[("o", 0, 3.0)])
    for by in (-3.0, 0.0, 3.0):
        box(30.5, by, 2.5, 0.5, 1.8, m["legno"])                    # rastrelliere
        cilindro(30.5, by, 0.05, 2.4, m["ferro"], vertici=6)

    # le DUE SCALE per il sotterraneo (stesse coordinate del livello di sotto!)
    scala(-20, -20, 3.0, "giu")
    scala(12, 28, 3.0, "giu")
    torcia(-22, -18.5)
    torcia(14, 29.5)


# ----------------------------------------------------- LIVELLO SOTTERRANEO ---
def costruisci_sotterraneo():
    m = M()
    X = X_DUNGEON
    # il "vuoto" nero: tutto cio' che non e' stanza resta buio pesto (leggibilita' del dungeon)
    box(X, 0, CAMPO * 1.2, CAMPO * 1.2, 0.05, m["vuoto"], z=-0.05)

    # sala della scala A (dal cortile) e corridoio principale verso est (largo 3 m = 2 celle)
    stanza(X - 20, -20, 8, 8, m["pav_dungeon"], aperture=[("e", 0, 3.0)])
    scala(X - 20, -20, 3.0, "giu")   # la scala vista da sotto (stesso quadretto della superficie)
    box(X - 2, -20, 28, 3.0, 0.22, m["pav_dungeon"])                # corridoio 1 (orizzontale)
    box(X - 2, -21.9, 28, 0.9, 3.5, m["pietra_scura"])
    box(X - 2, -18.1, 28, 0.9, 3.5, m["pietra_scura"])

    # corpo di guardia dei carcerieri
    stanza(X - 8, -11, 8, 8, m["pav_dungeon"], aperture=[("s", 0, 2.5)])
    box(X - 8, -11, 2.5, 1.2, 0.9, m["legno"])                      # tavolaccio
    torcia(X - 11, -9)

    # BLOCCO PRIGIONE: corsia centrale con 3 celle sbarrate per lato
    stanza(X + 2, -6, 18, 13, m["pav_dungeon"], aperture=[("s", 0, 3.0)])
    for i, cx in enumerate((X - 3.5, X + 2.0, X + 7.5)):
        box(cx - 2.6, -6, 0.5, 11, 3.2, m["pietra_scura"])          # tramezzi
        sbarre(cx - 2.0, -0.8, cx + 1.6, -0.8)                      # celle nord
        sbarre(cx - 2.0, -11.2, cx + 1.6, -11.2)                    # celle sud
        if i == 1:
            macerie(cx, -9.5, quante=3, raggio=0.8, seme=40 + i)    # ossa/macerie in cella
    torcia(X + 2, -6, z=2.6)
    box(X + 2, -6, 14, 2.6, 0.24, m["pav_dungeon"], z=0.02)         # corsia

    # corridoio 2 (verticale, est) fino alla sala della scala B
    box(X + 12, 2, 3.0, 47, 0.22, m["pav_dungeon"], z=0.0)
    box(X + 10.1, 2, 0.9, 47, 3.5, m["pietra_scura"])
    box(X + 13.9, 2, 0.9, 47, 3.5, m["pietra_scura"])
    torcia(X + 10.5, -10)
    torcia(X + 13.5, 6)
    torcia(X + 10.5, 18)
    stanza(X + 12, 28, 8, 8, m["pav_dungeon"], aperture=[("s", 0, 3.0)])
    scala(X + 12, 28, 3.0, "giu")    # la scala B, stesso quadretto del mastio

    # CATACOMBE: sala grande con nicchie e file di sarcofagi
    stanza(X - 4, 16, 24, 16, m["pav_dungeon"], spess=1.2,
           aperture=[("e", 0, 3.0), ("o", 0, 3.0)])
    box(X - 2, 12, 20, 3.0, 0.2, m["pav_dungeon"], z=0.02)          # raccordo al corridoio 2
    for i in range(4):
        for j in range(2):
            sx = X - 12 + i * 5.6
            sy = 12.5 + j * 7
            box(sx, sy, 2.4, 1.1, 1.0, m["pietra_scura"])           # sarcofago
            box(sx, sy, 2.0, 0.8, 0.25, m["pietra"], z=1.0)         # coperchio
    for nx in range(-14, 8, 4):
        box(X + nx, 23.6, 1.6, 0.7, 2.2, m["vuoto"], z=0.3)         # nicchie nel muro nord
    torcia(X - 14, 16)
    torcia(X + 6, 16)

    # CAMERA RITUALE: rotonda, cerchio runico emissivo, il cuore del male
    cilindro(X - 24, 16, 7.0, 0.24, m["pav_dungeon"])
    cilindro(X - 24, 16, 7.4, 4.0, m["pietra_scura"])
    cilindro(X - 24, 16, 6.6, 4.2, m["vuoto"])                      # interno cavo (muro anello)
    box(X - 17.2, 16, 3.4, 3.0, 0.26, m["pav_dungeon"])             # passaggio dalle catacombe
    cilindro(X - 24, 16, 3.2, 0.06, m["runa"], z=0.24)              # CERCHIO RUNICO
    cilindro(X - 24, 16, 2.2, 0.05, m["pav_dungeon"], z=0.28)
    for i in range(6):
        a = i * math.tau / 6
        box(X - 24 + math.cos(a) * 4.8, 16 + math.sin(a) * 4.8, 1.0, 1.0, 2.4,
            m["pietra_scura"])
        if i % 2 == 0:
            torcia(X - 24 + math.cos(a) * 4.2, 16 + math.sin(a) * 4.2, z=2.0)
    luce(X - 24, 16, 2.5, energia=70.0, colore=(0.55, 0.2, 0.9), raggio=1.2)

    # crollo che blocca il passaggio ovest della prigione (storia nel disegno)
    box(X - 14, -6, 6, 3.0, 0.2, m["pav_dungeon"])
    macerie(X - 15.5, -6, quante=10, raggio=2.0, seme=77)


# ------------------------------------------------------------ scena/render ---
def prepara_render():
    scena = bpy.context.scene
    scena.render.engine = "CYCLES"
    scena.cycles.samples = SAMPLES
    if hasattr(scena.cycles, "use_denoising"):
        scena.cycles.use_denoising = True
    scena.render.film_transparent = False
    scena.render.resolution_x = RES
    scena.render.resolution_y = RES
    scena.render.image_settings.file_format = "PNG"

    # Stessa cautela sulla localizzazione: "World" (nome dato) e "Background" (nome nodo)
    # possono essere tradotti in Blender in italiano — si prende il primo World esistente
    # (o se ne crea uno) e si cerca il nodo per TIPO, mai per stringa.
    mondo = scena.world if scena.world is not None \
        else (bpy.data.worlds[0] if len(bpy.data.worlds) > 0 else bpy.data.worlds.new("World"))
    scena.world = mondo
    mondo.use_nodes = True
    fondo = next((n for n in mondo.node_tree.nodes if n.type == "BACKGROUND"), None)
    if fondo is not None:
        fondo.inputs[0].default_value = (0.05, 0.06, 0.09, 1.0)  # notte blu, ma leggibile
        fondo.inputs[1].default_value = 0.35


def camera_su(x, y):
    bpy.ops.object.camera_add(location=(x, y, 90), rotation=(0, 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = CAMPO
    cam.data.clip_end = 300
    bpy.context.scene.camera = cam
    return cam


def sole():
    bpy.ops.object.light_add(type="SUN", location=(30, -30, 60))
    s = bpy.context.object
    s.rotation_euler = (math.radians(38), math.radians(6), math.radians(28))
    s.data.energy = 2.2
    s.data.color = (0.85, 0.82, 0.95)   # luna fredda: dark fantasy, ombre lunghe
    s.data.angle = math.radians(20)
    return s


def main():
    os.makedirs(CARTELLA_OUT, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    print("costruisco la superficie...")
    costruisci_superficie()
    print("costruisco il sotterraneo...")
    costruisci_sotterraneo()
    prepara_render()
    il_sole = sole()

    print("render 1/2: superficie...")
    camera_su(0, 0)
    bpy.context.scene.render.filepath = os.path.join(CARTELLA_OUT, "castello_superficie.png")
    bpy.ops.render.render(write_still=True)

    print("render 2/2: sotterraneo...")
    il_sole.data.energy = 0.25          # sottoterra la luna non arriva: comandano le torce
    camera_su(X_DUNGEON, 0)
    bpy.context.scene.render.filepath = os.path.join(CARTELLA_OUT, "castello_sotterraneo.png")
    bpy.ops.render.render(write_still=True)

    print("FATTO — battlemap in:", CARTELLA_OUT)
    print("Superficie e sotterraneo condividono scala e quadretti (scale allineate).")
    print("Trascinale sulla finestra del VTT (vista Mondo cucito) o usale come sfondo tattico.")


main()
