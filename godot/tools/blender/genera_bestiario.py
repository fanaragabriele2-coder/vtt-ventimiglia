"""Generatore del BESTIARIO in miniatura per il VTT — da eseguire DENTRO Blender (4.x/5.x).

Modella in 3D stilizzato tutte le 14 figure del gioco — gli 8 mostri del bestiario
(goblin, bandito, scheletro, lupo, orco, cultista, zombie, hobgoblin) e le 6 classi eroi
(guerriero, barbaro, ladro, ranger, mago, chierico) — ognuna su una BASETTA da miniatura
(bordo ROSSO per i nemici, ORO per gli eroi), le inquadra dall'alto con camera ortografica
e le renderizza in PNG 512x512 TRASPARENTI in "vtt_tokens" sul Desktop.

I nomi file coincidono con gli id del gioco: il VTT li carica da solo — basta copiare i PNG
nella cartella `user://tokens` del gioco (vicina a `user://maps`: dal gioco premi
"📁 Apri cartella mappe", risali di una cartella ed entra in `tokens`). Da quel momento
la mappa tattica e il Mondo cucito usano le TUE miniature al posto dei token inclusi.

COME ESEGUIRLO: identico a genera_props.py (vedi README.md in questa cartella) —
via Claude Desktop + Blender MCP ("esegui questo script in Blender") o dal tab Scripting.
"""
import math
import os
import random

import bpy

random.seed(20260712)
DIM_RENDER = 512
CARTELLA_OUT = os.path.join(os.path.expanduser("~"), "Desktop", "vtt_tokens")
ROSSO_NEMICO = (0.45, 0.08, 0.06)
ORO_EROE = (0.72, 0.55, 0.18)


# ---------------------------------------------------------------- utilita' ---
def pulisci_scena():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocco in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for dato in list(blocco):
            if dato.users == 0:
                blocco.remove(dato)


def materiale(nome, colore, ruvido=0.85, emissione=None, forza_emissione=8.0):
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    # Cerca per TIPO, non per nome: in Blender localizzato (es. italiano) il nome del nodo
    # creato automaticamente puo' essere tradotto, e nodes.get() per stringa fallirebbe.
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    bsdf.inputs["Base Color"].default_value = (*colore, 1.0)
    bsdf.inputs["Roughness"].default_value = ruvido
    if emissione is not None:
        for nome_input in ("Emission Color", "Emission"):
            if nome_input in bsdf.inputs:
                bsdf.inputs[nome_input].default_value = (*emissione, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = forza_emissione
    return mat


def sfera(pos, raggio, mat, scala=(1, 1, 1), seme=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=raggio, location=pos)
    ob = bpy.context.object
    ob.scale = scala
    if seme is not None:
        rnd = random.Random(seme)
        for v in ob.data.vertices:
            v.co *= 1.0 + (rnd.random() - 0.5) * 0.22
    ob.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return ob


def cilindro(pos, raggio, altezza, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=raggio, depth=altezza,
                                        location=pos, rotation=rot)
    ob = bpy.context.object
    ob.data.materials.append(mat)
    return ob


def cono(pos, raggio, altezza, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=raggio, depth=altezza,
                                    location=pos, rotation=rot)
    ob = bpy.context.object
    ob.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return ob


def cubo(pos, scala, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos, rotation=rot)
    ob = bpy.context.object
    ob.scale = scala
    ob.data.materials.append(mat)
    return ob


def basetta(nemico):
    """Disco da miniatura: piano scuro + anello colore-fazione (rosso nemici, oro eroi)."""
    scuro = materiale("base", (0.09, 0.08, 0.07), ruvido=0.95)
    anello = materiale("anello", ROSSO_NEMICO if nemico else ORO_EROE, ruvido=0.45)
    cilindro((0, 0, 0.04), 0.95, 0.08, scuro)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.9, minor_radius=0.07,
                                     location=(0, 0, 0.08))
    bpy.context.object.data.materials.append(anello)


def spada(pos, mat_lama, mat_manico, ang=0.9):
    cubo((pos[0], pos[1], pos[2]), (0.07, 0.5, 0.03), mat_lama, rot=(0, 0, ang))
    cubo((pos[0] - math.sin(ang) * 0.28, pos[1] - math.cos(ang) * 0.28, pos[2]),
         (0.16, 0.05, 0.04), mat_manico, rot=(0, 0, ang))


def umanoide(colore_corpo, colore_testa, statura=1.0, larghezza=1.0, seme=1):
    """Corpo+testa+spalle visti dall'alto: la sagoma classica della miniatura top-down."""
    corpo = materiale("corpo_%d" % seme, colore_corpo)
    testa = materiale("testa_%d" % seme, colore_testa)
    sfera((0, -0.05, 0.55 * statura), 0.42 * larghezza, corpo,
          scala=(1.0, 0.82, 1.0), seme=seme)
    sfera((0.3 * larghezza, 0.05, 0.5 * statura), 0.16, corpo, seme=seme + 1)
    sfera((-0.3 * larghezza, 0.05, 0.5 * statura), 0.16, corpo, seme=seme + 2)
    sfera((0, 0.16, 0.78 * statura), 0.2, testa, seme=seme + 3)
    return corpo, testa


ACCIAIO = (0.65, 0.66, 0.7)
LEGNO = (0.3, 0.19, 0.09)


# ------------------------------------------------------- gli 8 del bestiario ---
def mostro_goblin():
    umanoide((0.24, 0.42, 0.16), (0.32, 0.52, 0.2), statura=0.75, larghezza=0.8, seme=10)
    spada((0.42, 0.28, 0.42), materiale("lama_g", ACCIAIO, 0.35), materiale("man_g", LEGNO))


def mostro_bandito():
    umanoide((0.32, 0.22, 0.13), (0.7, 0.55, 0.42), seme=20)
    spada((0.45, 0.3, 0.55), materiale("lama_b", ACCIAIO, 0.35), materiale("man_b", LEGNO))
    # cappuccio: cono basso sulla testa
    cono((0, 0.16, 0.95), 0.24, 0.3, materiale("cappuccio", (0.2, 0.14, 0.09)))


def mostro_scheletro():
    osso = (0.82, 0.78, 0.68)
    umanoide(osso, osso, larghezza=0.75, seme=30)
    # costole: tre anelli sottili sul torace
    for i, z in enumerate((0.45, 0.55, 0.65)):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.3 - i * 0.03, minor_radius=0.025,
                                         location=(0, -0.05, z))
        bpy.context.object.data.materials.append(materiale("costola_%d" % i, osso))
    spada((0.45, 0.3, 0.5), materiale("lama_s", (0.5, 0.5, 0.52), 0.6),
          materiale("man_s", LEGNO))


def mostro_lupo():
    pelo = materiale("pelo", (0.35, 0.37, 0.4))
    pelo_s = materiale("pelo_s", (0.24, 0.25, 0.28))
    sfera((0, -0.15, 0.35), 0.4, pelo, scala=(0.62, 1.35, 0.55), seme=40)   # corpo lungo
    sfera((0, 0.55, 0.4), 0.22, pelo, scala=(0.8, 1.0, 0.7), seme=41)       # muso avanti
    cono((0.1, 0.72, 0.5), 0.07, 0.18, pelo_s)                              # orecchie
    cono((-0.1, 0.72, 0.5), 0.07, 0.18, pelo_s)
    sfera((0, -0.75, 0.35), 0.1, pelo_s, scala=(0.6, 1.8, 0.5), seme=42)    # coda


def mostro_orco():
    umanoide((0.2, 0.3, 0.14), (0.26, 0.38, 0.18), statura=1.15, larghezza=1.3, seme=50)
    # ascia bipenne: manico + due lame
    cilindro((0.55, 0.15, 0.6), 0.04, 1.0, materiale("man_o", LEGNO),
             rot=(0, math.radians(15), 0))
    for lato in (-1, 1):
        cono((0.55 + lato * 0.14, 0.15, 1.0), 0.2, 0.24,
             materiale("lama_o", ACCIAIO, 0.4), rot=(0, math.radians(90 * lato), 0))


def mostro_cultista():
    tonaca = materiale("tonaca", (0.24, 0.13, 0.3))
    cono((0, -0.05, 0.5), 0.5, 1.0, tonaca)                                 # veste
    sfera((0, 0.12, 0.95), 0.18, materiale("volto", (0.1, 0.06, 0.12)), seme=60)
    cono((0, 0.12, 1.15), 0.16, 0.28, tonaca)                               # cappuccio
    # pugnale rituale
    cubo((0.4, 0.2, 0.55), (0.05, 0.3, 0.02), materiale("lama_c", ACCIAIO, 0.3),
         rot=(0, 0, 0.7))


def mostro_zombie():
    carne = (0.4, 0.47, 0.3)
    umanoide(carne, (0.45, 0.52, 0.34), statura=0.95, seme=70)
    # braccio proteso in avanti: il gesto che dice "zombie" anche dall'alto
    cilindro((0.15, 0.5, 0.6), 0.08, 0.55, materiale("braccio", carne),
             rot=(math.radians(90), 0, math.radians(-12)))


def mostro_hobgoblin():
    umanoide((0.42, 0.2, 0.12), (0.55, 0.3, 0.18), statura=1.05, larghezza=1.1, seme=80)
    spada((0.48, 0.3, 0.58), materiale("lama_h", ACCIAIO, 0.35), materiale("man_h", LEGNO))
    # scudo rotondo sull'altro braccio
    cilindro((-0.5, 0.1, 0.55), 0.28, 0.06, materiale("scudo", (0.5, 0.12, 0.1), 0.5),
             rot=(0, math.radians(90), 0))


# ------------------------------------------------------------- le 6 classi ---
def eroe_guerriero():
    umanoide(ACCIAIO, (0.72, 0.58, 0.45), seme=110)
    spada((0.45, 0.3, 0.6), materiale("lama_gu", (0.8, 0.82, 0.88), 0.25),
          materiale("man_gu", (0.5, 0.38, 0.12)))
    cilindro((-0.48, 0.1, 0.55), 0.3, 0.06,
             materiale("scudo_gu", (0.2, 0.3, 0.55), 0.5), rot=(0, math.radians(90), 0))


def eroe_barbaro():
    umanoide((0.55, 0.38, 0.26), (0.68, 0.5, 0.38), statura=1.1, larghezza=1.25, seme=120)
    cilindro((0.55, 0.15, 0.62), 0.045, 1.05, materiale("man_ba", LEGNO),
             rot=(0, math.radians(12), 0))
    for lato in (-1, 1):
        cono((0.55 + lato * 0.15, 0.15, 1.05), 0.22, 0.26,
             materiale("lama_ba", (0.55, 0.55, 0.58), 0.5),
             rot=(0, math.radians(90 * lato), 0))


def eroe_ladro():
    umanoide((0.16, 0.16, 0.2), (0.66, 0.52, 0.4), larghezza=0.85, seme=130)
    cono((0, 0.16, 0.92), 0.22, 0.24, materiale("cappuccio_l", (0.12, 0.12, 0.16)))
    for lato in (-1, 1):  # due pugnali
        cubo((lato * 0.42, 0.25, 0.5), (0.045, 0.26, 0.02),
             materiale("lama_l%d" % lato, ACCIAIO, 0.3), rot=(0, 0, lato * 0.6))


def eroe_ranger():
    umanoide((0.22, 0.34, 0.18), (0.66, 0.5, 0.38), seme=140)
    # arco: mezzo toro sottile impugnato di lato
    bpy.ops.mesh.primitive_torus_add(major_radius=0.42, minor_radius=0.025,
                                     location=(0.5, 0.15, 0.6),
                                     rotation=(0, math.radians(90), 0))
    bpy.context.object.data.materials.append(materiale("arco", LEGNO))


def eroe_mago():
    tonaca = materiale("tonaca_m", (0.16, 0.24, 0.5))
    cono((0, -0.05, 0.5), 0.5, 1.0, tonaca)
    sfera((0, 0.12, 0.95), 0.18, materiale("volto_m", (0.7, 0.56, 0.44)), seme=150)
    cono((0, 0.12, 1.22), 0.2, 0.4, tonaca)                                 # cappello a punta
    cilindro((0.45, 0.1, 0.7), 0.035, 1.2, materiale("bastone", LEGNO))
    sfera((0.45, 0.1, 1.35), 0.1, materiale("cristallo", (0.4, 0.7, 1.0), 0.2,
          emissione=(0.3, 0.6, 1.0), forza_emissione=12.0))


def eroe_chierico():
    veste = materiale("veste_ch", (0.78, 0.74, 0.64))
    cono((0, -0.05, 0.5), 0.5, 1.0, veste)
    sfera((0, 0.12, 0.95), 0.18, materiale("volto_ch", (0.7, 0.56, 0.44)), seme=160)
    # simbolo sacro emissivo sul petto + mazza
    cubo((0, 0.38, 0.6), (0.05, 0.02, 0.16), materiale("croce_v", ORO_EROE, 0.3,
         emissione=(1.0, 0.85, 0.4), forza_emissione=6.0))
    cubo((0, 0.38, 0.6), (0.14, 0.02, 0.05), materiale("croce_o", ORO_EROE, 0.3,
         emissione=(1.0, 0.85, 0.4), forza_emissione=6.0))
    cilindro((0.45, 0.15, 0.6), 0.04, 0.7, materiale("mazza_m", LEGNO))
    sfera((0.45, 0.15, 1.0), 0.13, materiale("mazza_t", (0.5, 0.5, 0.54), 0.4), seme=161)


# ------------------------------------------------------------ scena/render ---
def prepara_scena():
    scena = bpy.context.scene
    scena.render.engine = "CYCLES"
    scena.cycles.samples = 64
    scena.render.film_transparent = True
    scena.render.resolution_x = DIM_RENDER
    scena.render.resolution_y = DIM_RENDER
    scena.render.image_settings.file_format = "PNG"
    scena.render.image_settings.color_mode = "RGBA"

    bpy.ops.object.camera_add(location=(0, 0, 12), rotation=(0, 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.4   # le basette sono tutte uguali: inquadratura fissa e coerente
    scena.camera = cam

    bpy.ops.object.light_add(type="SUN", location=(4, -4, 8))
    sole = bpy.context.object
    sole.rotation_euler = (math.radians(35), math.radians(8), math.radians(35))
    sole.data.energy = 3.5
    sole.data.angle = math.radians(15)

    mondo = scena.world if scena.world is not None \
        else (bpy.data.worlds[0] if len(bpy.data.worlds) > 0 else bpy.data.worlds.new("World"))
    scena.world = mondo
    mondo.use_nodes = True
    fondo = next((n for n in mondo.node_tree.nodes if n.type == "BACKGROUND"), None)
    if fondo is not None:
        fondo.inputs[0].default_value = (0.35, 0.38, 0.42, 1.0)
        fondo.inputs[1].default_value = 0.6
    return cam


#          id file          costruttore        nemico?
FIGURE = [
    ("goblin", mostro_goblin, True), ("bandit", mostro_bandito, True),
    ("skeleton", mostro_scheletro, True), ("wolf", mostro_lupo, True),
    ("orc", mostro_orco, True), ("cultist", mostro_cultista, True),
    ("zombie", mostro_zombie, True), ("hobgoblin", mostro_hobgoblin, True),
    ("guerriero", eroe_guerriero, False), ("barbaro", eroe_barbaro, False),
    ("ladro", eroe_ladro, False), ("ranger", eroe_ranger, False),
    ("mago", eroe_mago, False), ("chierico", eroe_chierico, False),
]


def main():
    os.makedirs(CARTELLA_OUT, exist_ok=True)
    pulisci_scena()
    cam = prepara_scena()
    protetti = {cam.name} | {o.name for o in bpy.context.scene.objects if o.type == "LIGHT"}
    for nome, costruisci, nemico in FIGURE:
        for ob in list(bpy.context.scene.objects):
            if ob.name not in protetti:
                bpy.data.objects.remove(ob, do_unlink=True)
        basetta(nemico)
        costruisci()
        bpy.context.scene.render.filepath = os.path.join(CARTELLA_OUT, nome + ".png")
        bpy.ops.render.render(write_still=True)
        print("renderizzato:", nome)
    print("FATTO — 14 miniature in:", CARTELLA_OUT)
    print("Copiale nella cartella user://tokens del gioco per usarle al posto dei token inclusi.")


main()
