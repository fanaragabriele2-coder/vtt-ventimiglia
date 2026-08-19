"""LA BANCA DEL DRAGO D'ORO — dungeon di rapina FANTASY per il VTT (Blender 4.x/5.x).

Scena di pura finzione scenografica per gioco di ruolo: la "sicurezza" e' fatta di golem,
rune, sigilli arcani e campane incantate — elementi narrativi con nomi chiari per il Master,
NESSUNA procedura o tecnica del mondo reale.

QUATTRO LIVELLI, quattro collezioni, quattro battlemap top-down alla STESSA scala VTT
(1 cella = 1,5 m, 64x64 celle inquadrate, 48 px/cella a 3072 px) + una vista prospettica
d'insieme della facciata. Render in Desktop/vtt_banca/:
  banca_01_esterno.png  — piazza con la statua del Drago d'Oro, scalinata monumentale,
                          facciata a colonne, torrette di guardia, TETTO praticabile
                          (lucernari, comignoli, cupola), vicolo laterale con grata delle
                          fogne (accesso alternativo scenico), zona di carico sul retro
                          con carro, casse e porta di servizio.
  banca_02_atrio.png    — atrio gigantesco senza soffitto (leggibile dall'alto): colonnati,
                          sportelli di cambio, GLOBO del mondo al centro, ufficio del
                          direttore in vista, sala d'attesa, archivio pubblico, piccolo
                          deposito, scalone monumentale, golem-custodi inattivi, campane
                          d'allarme, statua parlante.
  banca_03_uffici.png   — corridoi eleganti con porte numerate, sala riunioni, biblioteca
                          dei contratti, sala del consiglio, stanza del direttore
                          (scrivania, cassaforte secondaria, caminetto, libreria),
                          ARCHIVIO SEGRETO dietro la libreria, balconata sull'atrio.
  banca_04_caveau.png   — anticamera con saracinesche e sigilli, PORTA CIRCOLARE runica a
                          ingranaggi, sala del tesoro (arena finale: monete, lingotti,
                          gemme, cassette di sicurezza, reliquie sigillate), camere di
                          contenimento, stanza della custodia con la chiave runica, stanza
                          delle prove col tesoro falso, TUNNEL ANTICO verso la cripta.
  banca_vista.png       — prospettica esterna (per il colpo d'occhio, non per la griglia).

Collezioni: 01_Esterno, 02_Atrio, 03_Uffici, 04_Caveau, 05_Props, 06_Luci,
07_SicurezzaFantasy. Camere: CAM_Esterno, CAM_Atrio, CAM_Uffici, CAM_Caveau,
CAM_Prospettica. Gli oggetti chiave hanno nomi leggibili (Porta_Caveau, Archivio_Segreto,
Tunnel_Antico...). Esecuzione: come gli altri script (Claude Desktop + MCP o tab Scripting).
Con Poly Haven attivo nell'addon puoi poi chiedere texture CC0 vere (marmo, ottone, pietra).
"""
import math
import os
import random

import bpy

random.seed(20260715)
RES = 3072
CAMPO = 96.0                 # 64 celle da 1,5 m — stessa scala su TUTTI i livelli
SAMPLES = 48
OFF = {"esterno": 0.0, "atrio": 300.0, "uffici": 600.0, "caveau": 900.0}
CARTELLA_OUT = os.path.join(os.path.expanduser("~"), "Desktop", "vtt_banca")

# ------------------------------------------------------------- collezioni ---
_collezioni = {}


def collezione(nome):
    if nome in _collezioni:
        return _collezioni[nome]
    coll = bpy.data.collections.get(nome)
    if coll is None:
        coll = bpy.data.collections.new(nome)
        bpy.context.scene.collection.children.link(coll)
    _collezioni[nome] = coll
    return coll


def sposta_in(ob, nome_coll):
    dest = collezione(nome_coll)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    dest.objects.link(ob)
    return ob


_coll_attiva = ["05_Props"]


def attiva(nome_coll):
    """Le primitive create dopo questa chiamata finiscono nella collezione indicata."""
    collezione(nome_coll)
    _coll_attiva[0] = nome_coll


# ---------------------------------------------------------------- materiali ---
_materiali = {}


def materiale(nome, colore, ruvido=0.9, emissione=None, forza=6.0, bump=0.0, metallo=0.0):
    if nome in _materiali:
        return _materiali[nome]
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    # Per TIPO, mai per nome: in Blender localizzato i nomi dei nodi sono tradotti.
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
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
        nt = mat.node_tree
        rumore = nt.nodes.new("ShaderNodeTexNoise")
        rumore.inputs["Scale"].default_value = 16.0
        nodo = nt.nodes.new("ShaderNodeBump")
        nodo.inputs["Strength"].default_value = bump
        nt.links.new(rumore.outputs["Fac"], nodo.inputs["Height"])
        nt.links.new(nodo.outputs["Normal"], bsdf.inputs["Normal"])
    _materiali[nome] = mat
    return mat


def M():
    return {
        "pietra_chiara": materiale("pietra_chiara", (0.62, 0.58, 0.50), 0.9, bump=0.25),
        "pietra_scura": materiale("pietra_scura", (0.16, 0.155, 0.15), 0.95, bump=0.3),
        "marmo": materiale("marmo", (0.78, 0.75, 0.70), 0.25, bump=0.05),
        "marmo_verde": materiale("marmo_verde", (0.16, 0.30, 0.22), 0.3),
        "tetto": materiale("tetto", (0.13, 0.14, 0.18), 0.8, bump=0.2),
        "rame": materiale("rame", (0.45, 0.24, 0.14), 0.4, metallo=0.8),
        "legno_scuro": materiale("legno_scuro", (0.14, 0.09, 0.05), 0.8, bump=0.12),
        "ottone": materiale("ottone", (0.62, 0.45, 0.16), 0.3, metallo=0.9),
        "oro": materiale("oro", (0.75, 0.55, 0.15), 0.25, metallo=1.0),
        "ferro": materiale("ferro", (0.10, 0.10, 0.11), 0.5, metallo=0.7),
        "strada": materiale("strada", (0.24, 0.23, 0.22), 0.95, bump=0.3),
        "tappeto": materiale("tappeto", (0.36, 0.06, 0.08), 0.95),
        "vetro": materiale("vetro", (0.55, 0.68, 0.75), 0.1, metallo=0.1),
        "cristallo": materiale("cristallo", (0.2, 0.75, 0.65), 0.2,
                               emissione=(0.15, 0.9, 0.7), forza=9.0),
        "runa_blu": materiale("runa_blu", (0.15, 0.4, 0.9), 0.3,
                              emissione=(0.2, 0.5, 1.0), forza=8.0),
        "fiamma": materiale("fiamma", (1.0, 0.5, 0.1), 0.5,
                            emissione=(1.0, 0.45, 0.08), forza=15.0),
        "gemma": materiale("gemma", (0.7, 0.1, 0.3), 0.15,
                           emissione=(0.9, 0.1, 0.35), forza=4.0),
        "vuoto": materiale("vuoto", (0.005, 0.005, 0.008), 1.0),
    }


# ---------------------------------------------------------------- primitive ---
def box(x, y, w, d, h, mat, z=0.0, rot=0.0, nome=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + h / 2))
    ob = bpy.context.object
    ob.scale = (w, d, h)
    ob.rotation_euler.z = rot
    ob.data.materials.append(mat)
    if nome:
        ob.name = nome
    sposta_in(ob, _coll_attiva[0])
    return ob


def cilindro(x, y, r, h, mat, z=0.0, vertici=24, nome=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=vertici,
                                        location=(x, y, z + h / 2))
    ob = bpy.context.object
    ob.data.materials.append(mat)
    if nome:
        ob.name = nome
    sposta_in(ob, _coll_attiva[0])
    return ob


def sfera(x, y, z, r, mat, scala_z=1.0, nome=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
    ob = bpy.context.object
    ob.scale.z = scala_z
    ob.data.materials.append(mat)
    if nome:
        ob.name = nome
    sposta_in(ob, _coll_attiva[0])
    return ob


def luce(x, y, z, energia=60.0, colore=(1.0, 0.75, 0.4), raggio=0.5, nome=None):
    bpy.ops.object.light_add(type="POINT", location=(x, y, z))
    lp = bpy.context.object
    lp.data.energy = energia
    lp.data.color = colore
    lp.data.shadow_soft_size = raggio
    if nome:
        lp.name = nome
    sposta_in(lp, "06_Luci")
    return lp


def lampadario(x, y, z=6.0):
    m = M()
    cilindro(x, y, 0.7, 0.25, m["ottone"], z=z, vertici=12)
    luce(x, y, z - 0.4, energia=120.0, colore=(1.0, 0.8, 0.5), raggio=0.8)


def candelabro(x, y):
    m = M()
    cilindro(x, y, 0.08, 1.6, m["ottone"], vertici=8)
    sfera(x, y, 1.75, 0.12, m["fiamma"])
    luce(x, y, 2.1, energia=30.0)


def stanza(x, y, w, d, mat_pav, spess=0.8, h=3.5, aperture=(), mat_muro=None, nome=None):
    """Stanza senza soffitto. aperture = [(lato n/s/e/o, offset, larghezza), ...]."""
    m = M()
    mm = mat_muro if mat_muro is not None else m["pietra_chiara"]
    box(x, y, w, d, 0.22, mat_pav, nome=nome)
    lati = {"n": (x, y + d / 2, True), "s": (x, y - d / 2, True),
            "e": (x + w / 2, y, False), "o": (x - w / 2, y, False)}
    for lato, (mx, my, orizz) in lati.items():
        varchi = sorted([(off, larg) for (l, off, larg) in aperture if l == lato])
        lung = w if orizz else d
        if not varchi:
            if orizz:
                box(mx, my, lung, spess, h, mm, z=0.22)
            else:
                box(mx, my, spess, lung, h, mm, z=0.22)
            continue
        cursore = -lung / 2
        segmenti = []
        for off, larg in varchi:
            if off - larg / 2 > cursore:
                segmenti.append((cursore, off - larg / 2))
            cursore = off + larg / 2
        if cursore < lung / 2:
            segmenti.append((cursore, lung / 2))
        for a, b in segmenti:
            if b - a < 0.25:
                continue
            c, e = (a + b) / 2, b - a
            if orizz:
                box(x + c, my, e, spess, h, mm, z=0.22)
            else:
                box(mx, y + c, spess, e, h, mm, z=0.22)


def colonna(x, y, h=6.0, r=0.7):
    m = M()
    cilindro(x, y, r * 1.3, 0.3, m["marmo"], vertici=16)
    cilindro(x, y, r, h, m["marmo"], z=0.3, vertici=16)
    cilindro(x, y, r * 1.3, 0.3, m["marmo"], z=0.3 + h, vertici=16)


def statua_drago(x, y, scala=1.0, nome=None):
    """Statua del drago araldico: basamento, corpo accovacciato, collo, ali stilizzate."""
    m = M()
    box(x, y, 2.2 * scala, 2.2 * scala, 0.5 * scala, m["marmo"], nome=nome)
    sfera(x, y, (0.5 + 0.8) * scala, 0.9 * scala, m["oro"], scala_z=0.75)
    cilindro(x + 0.5 * scala, y + 0.4 * scala, 0.22 * scala, 1.6 * scala, m["oro"],
             z=0.9 * scala, vertici=10)
    sfera(x + 0.5 * scala, y + 0.4 * scala, 2.7 * scala, 0.38 * scala, m["oro"], scala_z=0.8)
    for lato in (-1, 1):
        box(x - 0.5 * scala * lato, y - 0.2 * scala, 0.15 * scala, 1.4 * scala,
            1.5 * scala, m["oro"], z=0.9 * scala, rot=0.5 * lato)


def golem(x, y, nome):
    """Golem-custode INATTIVO: statua massiccia di pietra scura con cuore di cristallo."""
    m = M()
    attiva("07_SicurezzaFantasy")
    box(x, y, 1.6, 1.2, 0.4, m["pietra_scura"], nome=nome)
    box(x, y, 1.2, 0.9, 1.8, m["pietra_scura"], z=0.4)
    sfera(x, y, 2.6, 0.45, m["pietra_scura"])
    sfera(x, y + 0.42, 1.5, 0.16, m["cristallo"])
    for lato in (-1, 1):
        box(x + 0.75 * lato, y, 0.35, 0.5, 1.5, m["pietra_scura"], z=0.5)


def campana(x, y, nome):
    m = M()
    attiva("07_SicurezzaFantasy")
    cilindro(x, y, 0.08, 2.6, m["ferro"], vertici=8)
    sfera(x, y, 2.75, 0.35, m["ottone"], scala_z=1.2, nome=nome)


def striscia_rune(x, y, lunghezza, rot=0.0, nome=None):
    m = M()
    attiva("07_SicurezzaFantasy")
    box(x, y, lunghezza, 0.35, 0.06, m["runa_blu"], z=0.24, rot=rot, nome=nome)


def scrivania(x, y, rot=0.0):
    m = M()
    box(x, y, 2.2, 1.0, 0.85, m["legno_scuro"], rot=rot)


def scaffale(x, y, lungo, rot=0.0):
    m = M()
    box(x, y, lungo, 0.45, 2.6, m["legno_scuro"], rot=rot)


def cassa(x, y, rot=0.0):
    m = M()
    box(x, y, 1.0, 1.0, 0.9, m["legno_scuro"], rot=rot)
    box(x, y, 1.06, 0.14, 0.95, m["ferro"], rot=rot)


def scala_vtt(x, y, larghezza, gradini=6, rot=0.0, nome=None):
    """Scalinata leggibile dall'alto: fasce alternate chiare/scure."""
    m = M()
    for i in range(gradini):
        off = (i - gradini / 2) * 0.6
        dx, dy = -math.sin(rot) * off, math.cos(rot) * off
        b = box(x + dx, y + dy, larghezza, 0.55, 0.1 + 0.04 * i,
                m["marmo"] if i % 2 else m["pietra_chiara"], rot=rot)
        if nome and i == 0:
            b.name = nome


def mucchio_monete(x, y, r=1.2, seme=0):
    m = M()
    rnd = random.Random(seme)
    for _ in range(5):
        a = rnd.random() * math.tau
        rr = rnd.random() * r * 0.7
        sfera(x + math.cos(a) * rr, y + math.sin(a) * rr, 0.25,
              0.45 + rnd.random() * 0.5, m["oro"], scala_z=0.35)


# ========================================================= LIVELLO 1: ESTERNO ---
def livello_esterno():
    X = OFF["esterno"]
    m = M()
    attiva("01_Esterno")
    # strada/piazza e vicolo laterale
    box(X, 0, CAMPO * 1.1, CAMPO * 1.1, 0.1, m["strada"], z=-0.1)
    box(X, -30, 60, 26, 0.14, m["pietra_chiara"], z=-0.04, nome="Piazza_Del_Drago")
    statua_drago(X, -34, scala=1.6, nome="Statua_Drago_Oro")
    luce(X, -34, 5, energia=80, colore=(1.0, 0.85, 0.5))

    # scalinata monumentale e facciata a colonne
    scala_vtt(X, -17.5, 20, gradini=6, nome="Scalinata_Ingresso")
    for cx in range(-12, 13, 4):
        colonna(X + cx, -13.5, h=8.0)
    box(X, -12.8, 30, 1.2, 8.5, m["pietra_chiara"], z=0)         # architrave facciata
    box(X, -12.6, 30, 1.4, 0.8, m["rame"], z=8.5)
    # portone principale doppio (metallo dorato su pietra)
    box(X - 1.6, -12.6, 3.0, 0.5, 5.0, m["ottone"], nome="Portone_Principale")
    box(X + 1.6, -12.6, 3.0, 0.5, 5.0, m["ottone"])
    striscia_rune(X, -14.6, 7.0, nome="Sigillo_Ingresso")
    # torrette di guardia ai lati della scalinata
    for lato in (-1, 1):
        cilindro(X + 17 * lato, -16, 2.2, 7.0, m["pietra_chiara"],
                 nome="Torretta_Guardia_%s" % ("Ovest" if lato < 0 else "Est"))
        cilindro(X + 17 * lato, -16, 2.5, 0.5, m["tetto"], z=7.0)
        luce(X + 17 * lato, -16, 8.0, energia=50)

    # corpo della banca: TETTO praticabile visto dall'alto (lucernari, cupola, comignoli)
    attiva("01_Esterno")
    box(X, 8, 46, 40, 12, m["pietra_chiara"], nome="Corpo_Banca")
    box(X, 8, 46.6, 40.6, 0.8, m["tetto"], z=12.0, nome="Tetto_Praticabile")
    sfera(X, 12, 13.6, 5.0, m["rame"], scala_z=0.6, nome="Cupola_Atrio")
    for lx, ly in [(-14, 0), (14, 0), (-14, 18), (14, 18), (0, 22)]:
        box(X + lx, ly, 3.4, 3.4, 0.5, m["vetro"], z=12.8,
            nome="Lucernario_%d_%d" % (lx, ly))
    for cx, cy in [(-19, 4), (19, 12), (8, 24)]:
        box(X + cx, cy, 1.2, 1.2, 2.2, m["pietra_scura"], z=12.8)   # comignoli
    for gx in (-16, 16):
        statua_drago(X + gx, 26, scala=0.7)                          # grifoni/draghi sul tetto
    # finestre alte e strette sulla facciata (fasce verticali)
    for fx in range(-18, 19, 6):
        box(X + fx, -11.9, 1.0, 0.3, 6.0, m["vetro"], z=4.0)

    # vicolo laterale ovest con grata delle fogne (ingresso alternativo SCENICO)
    box(X - 34, 8, 10, 46, 0.12, m["pietra_scura"], z=-0.03, nome="Vicolo_Laterale")
    cilindro(X - 34, -4, 1.4, 0.12, m["ferro"], nome="Grata_Fogne")
    striscia_rune(X - 34, -4, 2.6, nome="Sigillo_Fogne")
    for cy in (14, 20):
        cassa(X - 32, cy, rot=0.4)

    # zona di carico sul retro: carro, casse, porta di servizio
    attiva("01_Esterno")
    box(X, 34, 26, 10, 0.12, m["pietra_scura"], z=-0.03, nome="Zona_Carico")
    box(X - 6, 34, 3.6, 2.0, 1.2, m["legno_scuro"], nome="Carro_Consegne")
    for wx in (-7.4, -4.6):
        cilindro(wx + X, 33.0, 0.7, 0.25, m["legno_scuro"], vertici=12)
        cilindro(wx + X, 35.0, 0.7, 0.25, m["legno_scuro"], vertici=12)
    for i, (cx, cy) in enumerate([(2, 33), (4, 34.5), (3, 32)]):
        cassa(X + cx, cy, rot=i * 0.4)
    box(X + 10, 28.4, 2.6, 0.5, 3.2, m["ferro"], nome="Porta_Servizio")
    luce(X + 10, 30, 4.0, energia=40)


# =========================================================== LIVELLO 2: ATRIO ---
def livello_atrio():
    X = OFF["atrio"]
    m = M()
    attiva("02_Atrio")
    box(X, 0, CAMPO * 1.1, CAMPO * 1.1, 0.05, m["vuoto"], z=-0.05)

    # vestibolo d'ingresso + atrio gigantesco
    stanza(X, -26, 18, 10, m["marmo"], aperture=[("n", 0, 6.0), ("s", 0, 5.0)],
           nome="Vestibolo")
    striscia_rune(X, -30.6, 5.5, nome="Sigillo_Vestibolo")
    stanza(X, 2, 44, 46, m["marmo"], spess=1.2, h=9.0, nome="Atrio_Centrale",
           aperture=[("s", 0, 6.0), ("n", -14, 4.0), ("n", 14, 4.0),
                     ("e", -8, 3.5), ("o", -8, 3.5)])
    # fasce decorative del pavimento + tappeto centrale
    box(X, 2, 3.4, 40, 0.05, m["tappeto"], z=0.22)
    box(X, 2, 40, 3.0, 0.05, m["marmo_verde"], z=0.2)
    # doppio colonnato (copertura tattica!)
    for cy in range(-16, 21, 6):
        colonna(X - 12, cy, h=8.5)
        colonna(X + 12, cy, h=8.5)
    # GLOBO del mondo al centro
    cilindro(X, 2, 1.6, 0.9, m["marmo_verde"], vertici=16)
    sfera(X, 2, 2.2, 1.3, m["ottone"], nome="Globo_Del_Mondo")
    luce(X, 2, 5.0, energia=90)
    # sportelli di cambio: due file di banconi
    for by in (10, 14):
        box(X - 8, by, 14, 1.0, 1.1, m["legno_scuro"],
            nome="Sportelli_%s" % ("A" if by == 10 else "B"))
    box(X - 8, 12, 14, 0.15, 0.05, m["ottone"], z=1.15)
    # sala d'attesa (divanetti) e archivio pubblico
    for sx, sy in [(-16, -12), (-16, -8), (-16, -4)]:
        box(X + sx, sy, 3.0, 1.0, 0.6, m["tappeto"])
    stanza(X - 30, 2, 12, 14, m["marmo"], aperture=[("e", -4, 3.5)],
           nome="Archivio_Pubblico")
    for ay in (-2, 2, 6):
        scaffale(X - 32, ay, 7.0)
    # piccolo deposito + ufficio del direttore (visibile, separato)
    stanza(X + 30, -6, 12, 10, m["marmo"], aperture=[("o", 2, 3.5)], nome="Deposito")
    for i in range(3):
        cassa(X + 29 + (i % 2) * 2.4, -8 + i * 2.2, rot=i * 0.3)
    stanza(X + 30, 12, 12, 12, m["marmo"], aperture=[("o", -2, 3.5)],
           nome="Ufficio_Direttore_Vista")
    scrivania(X + 31, 13)
    candelabro(X + 27, 15)
    # scalone monumentale verso gli uffici + scala di servizio verso il caveau
    scala_vtt(X, 22, 12, gradini=7, nome="Scalone_Monumentale")
    scala_vtt(X + 19, -20, 3.2, gradini=5, rot=math.pi / 2, nome="Scala_Servizio_Caveau")
    # sicurezza fantasy: golem inattivi, statua parlante, campane d'allarme
    golem(X - 6, -22, "Golem_Custode_Ovest")
    golem(X + 6, -22, "Golem_Custode_Est")
    attiva("02_Atrio")
    statua_drago(X - 17, 20, scala=0.9, nome="Statua_Parlante")
    campana(X - 20, -22, "Campana_Allarme_Ovest")
    campana(X + 20, -22, "Campana_Allarme_Est")
    # lampadari caldi
    for lx, ly in [(-8, -8), (8, -8), (-8, 12), (8, 12), (0, 2)]:
        lampadario(X + lx, ly, z=7.0)


# ========================================================== LIVELLO 3: UFFICI ---
def livello_uffici():
    X = OFF["uffici"]
    m = M()
    attiva("03_Uffici")
    box(X, 0, CAMPO * 1.1, CAMPO * 1.1, 0.05, m["vuoto"], z=-0.05)

    # corona di uffici attorno alla BALCONATA che si affaccia sull'atrio (buco centrale)
    stanza(X, 0, 44, 46, m["marmo"], spess=1.2, h=4.0, nome="Piano_Uffici",
           aperture=[("s", 0, 5.0)])
    box(X, 0, 20, 22, 0.3, m["vuoto"], z=0.24, nome="Apertura_Su_Atrio")  # vuoto sull'atrio
    box(X, 11.6, 21, 0.35, 1.1, m["ottone"], z=0.22)   # ringhiere della balconata
    box(X, -11.6, 21, 0.35, 1.1, m["ottone"], z=0.22)
    box(X - 10.6, 0, 0.35, 23, 1.1, m["ottone"], z=0.22)
    box(X + 10.6, 0, 0.35, 23, 1.1, m["ottone"], z=0.22, nome="Balconata_Atrio")
    scala_vtt(X, -18, 12, gradini=7, nome="Arrivo_Scalone")

    # corridoio ovest con uffici numerati
    for i, oy in enumerate((14, 4, -6)):
        stanza(X - 28, oy, 11, 9, m["legno_scuro"], spess=0.7,
               aperture=[("e", 0, 2.2)], nome="Ufficio_0%d" % (i + 1))
        scrivania(X - 29, oy + 1)
        candelabro(X - 31, oy - 2)
    # sala riunioni + stanza degli impiegati (est)
    stanza(X + 28, 12, 12, 10, m["legno_scuro"], aperture=[("o", 0, 2.6)],
           nome="Sala_Riunioni")
    box(X + 28, 12, 6.5, 2.2, 0.9, m["legno_scuro"])
    stanza(X + 28, -2, 12, 10, m["legno_scuro"], aperture=[("o", 0, 2.6)],
           nome="Stanza_Impiegati")
    for dy in (-4.5, -2, 0.5):
        scrivania(X + 26, dy - 0.5)
    # sala del consiglio con vetrate (nord-est) e tavolo lungo
    stanza(X + 15, 20, 16, 9, m["marmo_verde"], aperture=[("s", -4, 3.0)],
           nome="Sala_Consiglio")
    box(X + 15, 20, 10, 2.4, 0.95, m["legno_scuro"])
    box(X + 15, 24.2, 15, 0.25, 3.0, m["vetro"], z=0.4)
    # stanza del direttore: scrivania, cassaforte secondaria, caminetto, libreria
    stanza(X - 15, 20, 16, 9, m["legno_scuro"], aperture=[("s", 4, 3.0)],
           nome="Stanza_Direttore")
    scrivania(X - 15, 21.5)
    box(X - 21.5, 20, 1.4, 1.4, 1.8, m["ferro"], nome="Cassaforte_Secondaria")
    box(X - 15, 24.0, 3.0, 0.8, 1.6, m["pietra_scura"], nome="Caminetto")
    luce(X - 15, 23.6, 1.2, energia=35, colore=(1.0, 0.5, 0.2))
    scaffale(X - 9.5, 20.5, 6.5, rot=math.pi / 2)
    box(X - 12, 18.5, 1.2, 0.7, 0.9, m["legno_scuro"], nome="Registro_Segreto")
    # ARCHIVIO SEGRETO dietro la libreria (porta occulta = varco stretto dietro lo scaffale)
    stanza(X - 15, 30.5, 12, 7, m["pietra_scura"], spess=0.8,
           aperture=[("s", 5, 1.4)], nome="Archivio_Segreto")
    box(X - 10, 27.2, 1.5, 0.4, 2.2, m["legno_scuro"], nome="Passaggio_Occulto")
    for ax in (-19, -15.5, -12):
        scaffale(X + ax + 0.0, 31.5, 3.0)
    box(X - 15, 29.2, 1.6, 0.9, 0.9, m["legno_scuro"], nome="Contratto_Maledetto")
    striscia_rune(X - 15, 29.2, 2.2, nome="Sigillo_Contratto")
    # biblioteca dei contratti (sud-est) con file di scaffali
    attiva("03_Uffici")
    stanza(X + 15, -18, 16, 12, m["legno_scuro"], aperture=[("n", 0, 3.0)],
           nome="Biblioteca_Contratti")
    for by in (-22, -19.5, -17, -14.5):
        scaffale(X + 15, by, 12)
    # archivio dei conti (sud-ovest)
    stanza(X - 15, -18, 16, 12, m["legno_scuro"], aperture=[("n", 0, 3.0)],
           nome="Archivio_Conti")
    for bx in (-20, -16.5, -13, -9.5):
        scaffale(X + bx, -18, 9, rot=math.pi / 2)
    # luci fredde e misteriose (lanterne arcane)
    for lx, ly in [(-24, 8), (24, 6), (0, 14), (0, -14), (-15, 25), (15, 25)]:
        luce(X + lx, ly, 3.2, energia=45, colore=(0.65, 0.75, 1.0))


# ========================================================== LIVELLO 4: CAVEAU ---
def livello_caveau():
    X = OFF["caveau"]
    m = M()
    attiva("04_Caveau")
    box(X, 0, CAMPO * 1.1, CAMPO * 1.1, 0.05, m["vuoto"], z=-0.05)

    # arrivo della scala di servizio + anticamera di sicurezza
    stanza(X - 26, -24, 8, 8, m["pietra_scura"], aperture=[("e", 0, 3.0)],
           nome="Arrivo_Scala")
    scala_vtt(X - 26, -24, 3.0, gradini=5)
    stanza(X - 8, -24, 26, 10, m["pietra_scura"], spess=1.2, h=4.5,
           aperture=[("o", 0, 3.0), ("n", 6, 4.0)], nome="Anticamera_Sicurezza")
    for gx in (-16, -10, -4):
        for gy in (-27, -21):
            cilindro(X + gx, gy, 0.09, 3.5, m["ferro"], vertici=6)   # saracinesche
    golem(X - 2, -27, "Golem_Sentinella_Anticamera")
    striscia_rune(X - 8, -19.4, 8.0, nome="Sigillo_Anticamera")
    luce(X - 8, -24, 3.5, energia=50, colore=(0.3, 0.6, 1.0))

    # PORTA DEL CAVEAU: circolare, runica, a ingranaggi
    attiva("04_Caveau")
    cilindro(X - 2, -16.5, 3.6, 1.2, m["ferro"], nome="Porta_Caveau")
    cilindro(X - 2, -16.5, 2.8, 1.3, m["ottone"])
    cilindro(X - 2, -16.5, 1.6, 1.4, m["runa_blu"])
    for i in range(6):
        a = i * math.tau / 6
        cilindro(X - 2 + math.cos(a) * 3.1, -16.5 + math.sin(a) * 3.1, 0.5, 1.35,
                 m["ottone"], vertici=8)
    luce(X - 2, -16.5, 3.0, energia=70, colore=(0.25, 0.55, 1.0))

    # SALA DEL TESORO: l'arena finale
    stanza(X, 2, 34, 30, m["pietra_scura"], spess=1.4, h=5.0,
           aperture=[("s", -2, 5.0), ("e", 4, 3.0), ("o", 4, 3.0), ("n", -10, 3.0)],
           nome="Sala_Tesoro")
    # cassette di sicurezza a parete (griglie dorate) + casseforti
    for wy in range(-6, 12, 4):
        box(X - 15.6, wy, 0.7, 3.0, 3.0, m["ottone"])
        box(X + 15.6, wy, 0.7, 3.0, 3.0, m["ottone"])
    for cx, cy in [(-10, 12), (-5, 13), (10, 12)]:
        box(X + cx, cy, 1.6, 1.6, 2.0, m["ferro"], nome="Cassaforte_%d" % cx)
    # il tesoro: monete, lingotti, gemme, reliquie sigillate
    mucchio_monete(X - 6, 2, seme=1)
    mucchio_monete(X + 5, 6, seme=2)
    mucchio_monete(X + 1, -4, r=1.6, seme=3)
    for i in range(4):
        box(X - 2 + i * 1.1, 9.5, 0.9, 0.5, 0.5 + (i % 2) * 0.3, m["oro"])  # lingotti
    for gx, gy in [(-9, 8), (8, -2), (-3, 12)]:
        sfera(X + gx, gy, 0.6, 0.5, m["gemma"])
    for rx in (-11, 11):
        cilindro(X + rx, -8, 0.9, 1.1, m["marmo"], vertici=12)
        sfera(X + rx, -8, 1.6, 0.55, m["cristallo"], nome="Reliquia_Sigillata_%d" % rx)
        striscia_rune(X + rx, -8, 2.0)
    # colonne runiche = coperture tattiche nell'arena
    for cx, cy in [(-8, -6), (8, -6), (-8, 10), (8, 10)]:
        cilindro(X + cx, cy, 0.9, 4.5, m["pietra_scura"], vertici=12)
        striscia_rune(X + cx, cy, 2.2)
    luce(X, 2, 4.5, energia=110, colore=(0.35, 0.8, 0.7), raggio=1.0)
    luce(X - 6, 2, 2.0, energia=45, colore=(1.0, 0.75, 0.3))   # oro che brilla

    # stanza di custodia (chiave runica) e stanza delle prove (tesoro falso)
    stanza(X - 26, 4, 12, 10, m["pietra_scura"], aperture=[("e", 0, 3.0)],
           nome="Stanza_Custodia")
    cilindro(X - 26, 4, 0.8, 1.1, m["marmo"], vertici=12)
    box(X - 26, 4, 0.5, 0.15, 0.7, m["runa_blu"], z=1.1, nome="Chiave_Runica")
    golem(X - 29, 7, "Golem_Custode_Chiave")
    stanza(X + 26, 6, 12, 10, m["pietra_scura"], aperture=[("o", 0, 3.0)],
           nome="Stanza_Prove")
    mucchio_monete(X + 26, 6, seme=9)
    box(X + 26, 6, 0.01, 0.01, 0.01, m["vuoto"], nome="Tesoro_Falso")
    # camere di contenimento magico (celle con rune al posto delle sbarre)
    for i, cx in enumerate((-8, 0, 8)):
        stanza(X + cx, 24, 7, 7, m["pietra_scura"], spess=0.7,
               aperture=[("s", 0, 2.2)], nome="Camera_Contenimento_%d" % (i + 1))
        striscia_rune(X + cx, 20.6, 2.4)
    box(X - 10, 18.5, 14, 3.0, 0.2, m["pietra_scura"], z=0.02)   # raccordo nord

    # TUNNEL ANTICO verso la cripta dimenticata (esce dal bordo mappa)
    attiva("04_Caveau")
    box(X + 26, -14, 3.0, 18, 0.2, m["pietra_scura"], z=0.0, nome="Tunnel_Antico")
    box(X + 24.4, -14, 0.8, 18, 3.0, m["pietra_scura"], z=0.2)
    box(X + 27.6, -14, 0.8, 18, 3.0, m["pietra_scura"], z=0.2)
    box(X + 26, -26, 10, 8, 0.2, m["pietra_scura"], nome="Cripta_Dimenticata")
    for sx, sy in [(24, -25), (28, -27), (26, -24)]:
        box(X + sx, sy, 2.2, 1.0, 0.9, m["pietra_scura"])          # sarcofagi della cripta
    # macerie del crollo antico al raccordo
    rnd = random.Random(55)
    for _ in range(7):
        a = rnd.random() * math.tau
        sfera(X + 26 + math.cos(a) * 1.6, -5 + math.sin(a) * 1.6, 0.3,
              0.35 + rnd.random() * 0.5, m["pietra_scura"], scala_z=0.6)
    luce(X + 26, -24, 2.5, energia=35, colore=(0.5, 0.9, 0.6))


# ------------------------------------------------------------ scena/render ---
def prepara_render():
    scena = bpy.context.scene
    scena.render.engine = "CYCLES"
    scena.cycles.samples = SAMPLES
    if hasattr(scena.cycles, "use_denoising"):
        scena.cycles.use_denoising = True
    scena.render.resolution_x = RES
    scena.render.resolution_y = RES
    scena.render.image_settings.file_format = "PNG"
    # Colori vividi (il default AgX desatura): giusto per una battlemap.
    scena.view_settings.view_transform = "Standard"
    scena.view_settings.look = "None"
    scena.view_settings.exposure = 0.3
    mondo = scena.world if scena.world is not None \
        else (bpy.data.worlds[0] if len(bpy.data.worlds) > 0 else bpy.data.worlds.new("W"))
    scena.world = mondo
    mondo.use_nodes = True
    fondo = next((n for n in mondo.node_tree.nodes if n.type == "BACKGROUND"), None)
    if fondo is not None:
        fondo.inputs[0].default_value = (0.06, 0.065, 0.09, 1.0)
        fondo.inputs[1].default_value = 0.4


def camera_top(nome, x, y):
    bpy.ops.object.camera_add(location=(x, y, 80), rotation=(0, 0, 0))
    cam = bpy.context.object
    cam.name = nome
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = CAMPO
    cam.data.clip_end = 300
    sposta_in(cam, "06_Luci")
    return cam


def sole():
    bpy.ops.object.light_add(type="SUN", location=(30, -40, 70))
    s = bpy.context.object
    s.rotation_euler = (math.radians(35), math.radians(8), math.radians(25))
    s.data.energy = 2.6
    s.data.color = (0.95, 0.9, 0.85)
    s.data.angle = math.radians(15)
    sposta_in(s, "06_Luci")
    return s


def renderizza(cam, file_png):
    bpy.context.scene.camera = cam
    bpy.context.scene.render.filepath = os.path.join(CARTELLA_OUT, file_png)
    bpy.ops.render.render(write_still=True)
    print("renderizzato:", file_png)


def main():
    os.makedirs(CARTELLA_OUT, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for nome in ("01_Esterno", "02_Atrio", "03_Uffici", "04_Caveau",
                 "05_Props", "06_Luci", "07_SicurezzaFantasy"):
        collezione(nome)

    print("LIVELLO 1: esterno...")
    livello_esterno()
    print("LIVELLO 2: atrio...")
    livello_atrio()
    print("LIVELLO 3: uffici...")
    livello_uffici()
    print("LIVELLO 4: caveau...")
    livello_caveau()

    prepara_render()
    il_sole = sole()
    cam_e = camera_top("CAM_Esterno", OFF["esterno"], 0)
    cam_a = camera_top("CAM_Atrio", OFF["atrio"], 0)
    cam_u = camera_top("CAM_Uffici", OFF["uffici"], 0)
    cam_c = camera_top("CAM_Caveau", OFF["caveau"], 0)

    renderizza(cam_e, "banca_01_esterno.png")
    il_sole.data.energy = 0.7            # dentro: comandano lampadari e lanterne
    renderizza(cam_a, "banca_02_atrio.png")
    renderizza(cam_u, "banca_03_uffici.png")
    il_sole.data.energy = 0.15           # nel caveau: luce arcana drammatica
    renderizza(cam_c, "banca_04_caveau.png")

    # vista prospettica d'insieme della facciata (colpo d'occhio, non per la griglia)
    il_sole.data.energy = 2.6
    bpy.ops.object.camera_add(location=(OFF["esterno"] + 46, -66, 26),
                              rotation=(math.radians(68), 0, math.radians(33)))
    cam_p = bpy.context.object
    cam_p.name = "CAM_Prospettica"
    sposta_in(cam_p, "06_Luci")
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1080
    renderizza(cam_p, "banca_vista.png")

    print("FATTO — 5 immagini in:", CARTELLA_OUT)
    print("Le 4 battlemap condividono la scala (48 px/cella): i piani si sovrappongono.")


main()
