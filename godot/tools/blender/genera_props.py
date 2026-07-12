"""Generatore di PROPS top-down per il VTT — da eseguire DENTRO Blender (4.x o 5.x).

Crea 8 oggetti di scena stilizzati (albero, pino, cespuglio, roccia, botte, cassa,
falo', pozzo), li inquadra dall'alto con camera ortografica e li renderizza in PNG
512x512 CON TRASPARENZA in una cartella "vtt_props" sul Desktop.

COME USARLO (due strade):
  A) Con Claude Desktop + Blender MCP: chiedi a Claude
     "Esegui in Blender il contenuto dello script genera_props.py che ti incollo"
     e incolla tutto questo file.
  B) A mano: Blender -> tab Scripting -> Open -> questo file -> Run Script (Alt+P).

I PNG risultanti sono pensati come props da battlemap (Fase C della ROADMAP: layer di
props posizionabili nel Mondo cucito) e nel frattempo si possono usare per decorare
le mappe in qualsiasi editor d'immagini. Sono generati da questo script: nessun
vincolo di licenza, sono tuoi.
"""
import math
import os
import random

import bpy
from mathutils import Vector

random.seed(20260712)
DIM_RENDER = 512
CARTELLA_OUT = os.path.join(os.path.expanduser("~"), "Desktop", "vtt_props")


# ---------------------------------------------------------------- utilita' ---
def pulisci_scena():
    """Rimuove tutti gli oggetti mesh/luci/camere per ripartire da zero."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocco in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for dato in list(blocco):
            if dato.users == 0:
                blocco.remove(dato)


def materiale(nome, colore, ruvido=0.8, emissione=None, forza_emissione=6.0):
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colore, 1.0)
    bsdf.inputs["Roughness"].default_value = ruvido
    if emissione is not None:
        # Il nome dell'input emissione cambia tra versioni: si prova in ordine.
        for nome_input in ("Emission Color", "Emission"):
            if nome_input in bsdf.inputs:
                bsdf.inputs[nome_input].default_value = (*emissione, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = forza_emissione
    return mat


def sfera(pos, raggio, mat, schiaccia=1.0, seme_deforma=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=raggio, location=pos)
    ob = bpy.context.object
    ob.scale.z *= schiaccia
    if seme_deforma is not None:
        rnd = random.Random(seme_deforma)
        for v in ob.data.vertices:
            v.co *= 1.0 + (rnd.random() - 0.5) * 0.35
    ob.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return ob


def cilindro(pos, raggio, altezza, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=raggio, depth=altezza,
                                        location=pos, rotation=rot)
    ob = bpy.context.object
    ob.data.materials.append(mat)
    return ob


def cono(pos, raggio, altezza, mat):
    bpy.ops.mesh.primitive_cone_add(radius1=raggio, depth=altezza, location=pos)
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


# ------------------------------------------------------------------- props ---
def prop_albero():
    tronco = materiale("tronco", (0.24, 0.15, 0.08))
    chioma = materiale("chioma", (0.16, 0.34, 0.12))
    chioma_hi = materiale("chioma_hi", (0.28, 0.46, 0.18))
    cilindro((0, 0, 0.5), 0.16, 1.0, tronco)
    for i in range(5):
        a = i * 2.51
        sfera((math.cos(a) * 0.45, math.sin(a) * 0.45, 1.25 + (i % 2) * 0.2),
              0.55, chioma, 0.8, seme_deforma=i)
    sfera((0.15, 0.2, 1.75), 0.45, chioma_hi, 0.75, seme_deforma=99)


def prop_pino():
    tronco = materiale("tronco_p", (0.22, 0.13, 0.07))
    aghi = materiale("aghi", (0.10, 0.26, 0.13))
    cilindro((0, 0, 0.3), 0.13, 0.6, tronco)
    cono((0, 0, 1.0), 0.85, 1.0, aghi)
    cono((0, 0, 1.65), 0.62, 0.9, aghi)
    cono((0, 0, 2.2), 0.4, 0.75, aghi)


def prop_cespuglio():
    fogliame = materiale("cespuglio", (0.19, 0.36, 0.14))
    for i in range(6):
        a = i * 1.13
        sfera((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.28), 0.34, fogliame,
              0.7, seme_deforma=i)


def prop_roccia():
    pietra = materiale("pietra", (0.42, 0.41, 0.38), ruvido=1.0)
    sfera((0, 0, 0.35), 0.7, pietra, 0.55, seme_deforma=7)
    sfera((0.55, -0.3, 0.2), 0.35, pietra, 0.6, seme_deforma=13)
    sfera((-0.5, 0.35, 0.18), 0.28, pietra, 0.65, seme_deforma=21)


def prop_botte():
    legno = materiale("legno_botte", (0.38, 0.24, 0.12))
    ferro = materiale("ferro", (0.15, 0.15, 0.16), ruvido=0.4)
    cilindro((0, 0, 0.45), 0.42, 0.9, legno)
    for z in (0.18, 0.72):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.43, minor_radius=0.03,
                                         location=(0, 0, z))
        bpy.context.object.data.materials.append(ferro)


def prop_cassa():
    legno = materiale("legno_cassa", (0.45, 0.3, 0.15))
    legno_s = materiale("legno_scuro", (0.3, 0.19, 0.09))
    cubo((0, 0, 0.4), (0.85, 0.85, 0.8), legno, rot=(0, 0, 0.2))
    cubo((0, 0, 0.82), (0.9, 0.9, 0.05), legno_s, rot=(0, 0, 0.2))


def prop_falo():
    pietra = materiale("pietra_f", (0.35, 0.34, 0.32), ruvido=1.0)
    legno = materiale("legno_f", (0.25, 0.15, 0.07))
    fuoco = materiale("fuoco", (1.0, 0.45, 0.05), ruvido=0.5,
                      emissione=(1.0, 0.38, 0.02), forza_emissione=14.0)
    for i in range(8):
        a = i * math.tau / 8
        sfera((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.12), 0.16, pietra,
              0.7, seme_deforma=i)
    for i in range(3):
        a = i * math.tau / 3
        cilindro((0, 0, 0.18), 0.07, 0.9, legno,
                 rot=(math.radians(70), 0, a))
    cono((0, 0, 0.55), 0.3, 0.8, fuoco)


def prop_pozzo():
    pietra = materiale("pietra_pozzo", (0.45, 0.44, 0.42), ruvido=1.0)
    legno = materiale("legno_pozzo", (0.32, 0.2, 0.1))
    acqua = materiale("acqua", (0.1, 0.25, 0.4), ruvido=0.1)
    cilindro((0, 0, 0.3), 0.6, 0.6, pietra)
    cilindro((0, 0, 0.55), 0.45, 0.1, acqua)
    for x in (-0.55, 0.55):
        cilindro((x, 0, 0.95), 0.06, 1.3, legno)
    cubo((0, 0, 1.62), (1.5, 0.5, 0.08), legno)


# ------------------------------------------------------------ scena/render ---
def prepara_scena():
    scena = bpy.context.scene
    scena.render.engine = "CYCLES"          # sempre disponibile, nome stabile tra versioni
    scena.cycles.samples = 64
    scena.render.film_transparent = True    # sfondo TRASPARENTE: e' un prop, non una mappa
    scena.render.resolution_x = DIM_RENDER
    scena.render.resolution_y = DIM_RENDER
    scena.render.image_settings.file_format = "PNG"
    scena.render.image_settings.color_mode = "RGBA"

    bpy.ops.object.camera_add(location=(0, 0, 12), rotation=(0, 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"                 # top-down vero: niente prospettiva
    scena.camera = cam

    bpy.ops.object.light_add(type="SUN", location=(4, -4, 8))
    sole = bpy.context.object
    sole.rotation_euler = (math.radians(35), math.radians(8), math.radians(35))
    sole.data.energy = 3.5
    sole.data.angle = math.radians(15)      # ombre morbide, da esterno

    mondo = bpy.data.worlds["World"] if bpy.data.worlds else bpy.data.worlds.new("World")
    scena.world = mondo
    mondo.use_nodes = True
    fondo = mondo.node_tree.nodes.get("Background")
    if fondo is not None:
        fondo.inputs[0].default_value = (0.35, 0.38, 0.42, 1.0)  # luce di riempimento fredda
        fondo.inputs[1].default_value = 0.6
    return cam


def inquadra(cam):
    """Ortho scale adattato all'ingombro reale del prop (+15% d'aria)."""
    xs, ys = [], []
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        for angolo in ob.bound_box:
            p = ob.matrix_world @ Vector(angolo)
            xs.append(abs(p.x))
            ys.append(abs(p.y))
    estensione = max(xs + ys) if xs else 1.5
    cam.data.ortho_scale = max(2.0, estensione * 2.3)


PROPS = {
    "albero": prop_albero, "pino": prop_pino, "cespuglio": prop_cespuglio,
    "roccia": prop_roccia, "botte": prop_botte, "cassa": prop_cassa,
    "falo": prop_falo, "pozzo": prop_pozzo,
}


def main():
    os.makedirs(CARTELLA_OUT, exist_ok=True)
    pulisci_scena()
    cam = prepara_scena()
    protetti = {cam.name} | {o.name for o in bpy.context.scene.objects if o.type == "LIGHT"}
    for nome, costruisci in PROPS.items():
        # via i mesh del prop precedente (camera e sole restano)
        for ob in list(bpy.context.scene.objects):
            if ob.name not in protetti:
                bpy.data.objects.remove(ob, do_unlink=True)
        costruisci()
        inquadra(cam)
        bpy.context.scene.render.filepath = os.path.join(CARTELLA_OUT, nome + ".png")
        bpy.ops.render.render(write_still=True)
        print("renderizzato:", nome)
    print("FATTO — props in:", CARTELLA_OUT)


main()
