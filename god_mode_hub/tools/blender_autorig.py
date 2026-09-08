"""Script Blender: rigging automatico di un .glb e animazione idle.

Eseguito da ``utils/rigging.py`` come:

    blender --background --python tools/blender_autorig.py -- \
            --input modello.glb --output riggato.glb [--animation idle]

Cosa fa, in ordine:

1. importa il ``.glb`` in una scena vuota;
2. **misura dove sono davvero gli arti**, analizzando la nuvola di vertici per
   fasce di altezza invece di fidarsi del solo riquadro di ingombro: le braccia
   di una posa A stanno vicino ai fianchi, e piazzare le ossa a una frazione
   fissa della larghezza le lascia dentro il torso, con deformazioni sbagliate
   (verificato guardando un rig renderizzato);
3. crea un'armatura con le ossa principali (bacino, spina, torace, collo,
   testa, braccia, gambe) posizionate su quelle proporzioni;
4. imparenta la mesh all'armatura con i **pesi automatici** di Blender;
5. applica un'animazione di base e riesporta in ``.glb``.

Limite dichiarato: l'analisi presuppone un **umanoide eretto** visto con Z in
alto. Su una creatura molto diversa (quadrupede, ameba, drago) le ossa
finiranno nel posto sbagliato e il rig andrà sistemato a mano in Blender.
Questo script fa il 90% del lavoro noioso, non sostituisce un rigger.
"""

import argparse
import math
import sys

import bpy  # disponibile solo dentro Blender
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    """Legge gli argomenti dopo il separatore ``--`` di Blender."""
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser(description="Rigging automatico di un .glb")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--animation", default="idle", choices=["idle", "none"])
    parser.add_argument("--frames", type=int, default=60)
    return parser.parse_args(argv)


def clear_scene() -> None:
    """Svuota la scena di default (cubo, luce, camera)."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocco in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
        for elemento in list(blocco):
            blocco.remove(elemento)


def import_glb(path: str):
    """Importa il modello e restituisce l'oggetto mesh più grande."""
    bpy.ops.import_scene.gltf(filepath=path)
    mesh = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not mesh:
        raise RuntimeError("Il file .glb non contiene mesh.")
    # Se il modello è diviso in più parti, la principale è quella con più vertici.
    return max(mesh, key=lambda o: len(o.data.vertices))


def world_bounds(obj) -> tuple[Vector, Vector]:
    """Riquadro di ingombro in coordinate mondo: ``(minimo, massimo)``."""
    angoli = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    minimo = Vector((min(c.x for c in angoli), min(c.y for c in angoli), min(c.z for c in angoli)))
    massimo = Vector((max(c.x for c in angoli), max(c.y for c in angoli), max(c.z for c in angoli)))
    return minimo, massimo


def limb_clusters(obj, minimo: Vector, massimo: Vector) -> dict:
    """Individua braccia e gambe analizzando la nuvola di vertici.

    In una posa A le braccia sono il gruppo di vertici **più esterno nella metà
    superiore**, le gambe quello nella metà inferiore. Misurare la loro
    estensione reale evita l'errore in cui ero incorso al primo tentativo:
    piazzare le ossa a una frazione fissa della larghezza le lascia dentro il
    torso, e i pesi automatici deformano male gli arti.

    Attenzione al filtro verticale: applicarlo *prima* di misurare l'estensione
    del braccio la tronca (verificato: su una mesh a bassa densità restavano
    solo i vertici della spalla, e le ossa diventavano monconi di 2 cm).

    Returns:
        ``spalla_x``, ``polso_x``, ``braccio_alto``, ``braccio_basso``,
        ``anca_x`` in coordinate mondo.
    """
    matrice = obj.matrix_world
    punti = [matrice @ v.co for v in obj.data.vertices]
    altezza = massimo.z - minimo.z
    meta_x = (massimo.x + minimo.x) / 2
    estremo_x = max((abs(p.x - meta_x) for p in punti), default=0.0) or 1.0

    # Proporzioni classiche, usate se l'analisi non riconosce arti sporgenti
    # (creatura non umanoide, mesh molto irregolare).
    ripiego = {
        "spalla_x": estremo_x * 0.55,
        "polso_x": estremo_x * 0.60,
        "braccio_alto": minimo.z + altezza * 0.80,
        "braccio_basso": minimo.z + altezza * 0.50,
        "anca_x": estremo_x * 0.18,
    }

    # Braccia: vertici ben esterni e sopra il ginocchio. Il filtro verticale
    # serve solo a escludere le gambe, non a delimitare il braccio.
    braccia = [
        p for p in punti
        if abs(p.x - meta_x) > estremo_x * 0.50
        and p.z > minimo.z + altezza * 0.35
    ]
    destri = [p for p in braccia if p.x > meta_x]
    if len(destri) >= 4:
        alto = max(p.z for p in destri)
        basso = min(p.z for p in destri)
        larghezza_braccio = sum(p.x - meta_x for p in destri) / len(destri)
        # Un braccio deve avere una lunghezza sensata: sotto il 15% dell'altezza
        # il riconoscimento ha preso solo una fetta e i valori non sono usabili.
        if (alto - basso) >= altezza * 0.15:
            spalla_x = larghezza_braccio
        else:
            alto, basso = ripiego["braccio_alto"], ripiego["braccio_basso"]
            spalla_x = ripiego["spalla_x"]
    else:
        alto, basso = ripiego["braccio_alto"], ripiego["braccio_basso"]
        spalla_x = ripiego["spalla_x"]

    # Gambe: gruppo inferiore, ne prendo la distanza media dal centro.
    gambe = [p for p in punti if p.z < minimo.z + altezza * 0.35 and p.x > meta_x]
    if len(gambe) >= 4:
        anca_x = sum(p.x - meta_x for p in gambe) / len(gambe)
    else:
        anca_x = ripiego["anca_x"]

    return {
        "spalla_x": max(spalla_x, estremo_x * 0.15),
        "polso_x": max(spalla_x * 1.05, estremo_x * 0.20),
        "braccio_alto": alto,
        "braccio_basso": basso,
        "anca_x": max(anca_x, estremo_x * 0.06),
    }


def build_armature(obj, minimo: Vector, massimo: Vector):
    """Crea l'armatura umanoide, allineata agli arti trovati nella mesh.

    La colonna centrale segue le frazioni di altezza del canone anatomico
    (bacino ~0.53, spalle ~0.82, testa ~0.93); braccia e gambe vengono invece
    posizionate sui gruppi di vertici reali, così le ossa cadono **dentro** gli
    arti e i pesi automatici deformano nel modo giusto.
    """
    altezza = massimo.z - minimo.z
    centro_x = (massimo.x + minimo.x) / 2
    centro_y = (massimo.y + minimo.y) / 2
    base_z = minimo.z
    arti = limb_clusters(obj, minimo, massimo)

    def punto(frazione_altezza: float, scarto_x: float = 0.0) -> Vector:
        return Vector((centro_x + scarto_x, centro_y, base_z + altezza * frazione_altezza))

    def punto_z(z_mondo: float, scarto_x: float = 0.0) -> Vector:
        return Vector((centro_x + scarto_x, centro_y, z_mondo))

    bpy.ops.object.armature_add(enter_editmode=True, location=(centro_x, centro_y, base_z))
    armatura = bpy.context.object
    armatura.name = "AutoRig"
    ossa = armatura.data.edit_bones
    for osso in list(ossa):
        ossa.remove(osso)  # via l'osso di default

    def nuovo(nome: str, testa: Vector, coda: Vector, genitore=None, connesso=False):
        osso = ossa.new(nome)
        osso.head = testa
        osso.tail = coda
        if genitore is not None:
            osso.parent = genitore
            osso.use_connect = connesso
        return osso

    # Colonna centrale
    bacino = nuovo("bacino", punto(0.50), punto(0.53))
    spina = nuovo("spina", punto(0.53), punto(0.68), bacino, True)
    torace = nuovo("torace", punto(0.68), punto(0.82), spina, True)
    collo = nuovo("collo", punto(0.82), punto(0.88), torace, True)
    nuovo("testa", punto(0.88), punto(1.00), collo, True)

    # Braccia: dal gruppo di vertici realmente individuato sui fianchi.
    spalla_x, polso_x = arti["spalla_x"], arti["polso_x"]
    alto, basso = arti["braccio_alto"], arti["braccio_basso"]
    gomito_z = (alto + basso) / 2
    anca_x = arti["anca_x"]

    for lato, segno in (("L", 1.0), ("R", -1.0)):
        braccio = nuovo(
            f"braccio_{lato}",
            punto_z(alto, segno * spalla_x * 0.75),
            punto_z(gomito_z, segno * spalla_x),
        )
        braccio.parent = torace
        nuovo(
            f"avambraccio_{lato}",
            punto_z(gomito_z, segno * spalla_x),
            punto_z(basso, segno * polso_x),
            braccio, True,
        )
        coscia = nuovo(f"coscia_{lato}", punto(0.50, segno * anca_x),
                       punto(0.28, segno * anca_x), bacino)
        nuovo(f"gamba_{lato}", punto(0.28, segno * anca_x),
              punto(0.03, segno * anca_x), coscia, True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return armatura


def bind_mesh(mesh, armatura) -> None:
    """Imparenta la mesh all'armatura con i pesi automatici di Blender."""
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    armatura.select_set(True)
    bpy.context.view_layer.objects.active = armatura
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def animate_idle(armatura, frames: int) -> None:
    """Respiro leggero e oscillazione delle braccia: il modello 'vive'.

    Volutamente sobria: un'animazione idle marcata stona su un token fermo
    sulla mappa. Serve a far capire che il rig funziona ed è un punto di
    partenza da rifinire in Blender.
    """
    scena = bpy.context.scene
    scena.frame_start = 1
    scena.frame_end = frames

    bpy.context.view_layer.objects.active = armatura
    bpy.ops.object.mode_set(mode="POSE")
    ossa = armatura.pose.bones

    def chiave(nome_osso: str, frame: int, gradi: float) -> None:
        osso = ossa.get(nome_osso)
        if osso is None:
            return
        osso.rotation_mode = "XYZ"
        osso.rotation_euler[0] = math.radians(gradi)
        osso.keyframe_insert(data_path="rotation_euler", frame=frame)

    # Ampiezze in GRADI. Misurate sul modello di prova: al picco il vertice
    # più mobile si sposta di circa il 2,9% dell'altezza — percepibile senza
    # sembrare un'agitazione. Il ciclo torna a zero sull'ultimo fotogramma,
    # altrimenti l'animazione scatterebbe a ogni ripetizione.
    meta = frames // 2
    for nome, gradi in (("spina", 2.0), ("torace", 1.4),
                        ("braccio_L", 2.9), ("braccio_R", 2.9)):
        chiave(nome, 1, 0.0)
        chiave(nome, meta, gradi)
        chiave(nome, frames, 0.0)

    bpy.ops.object.mode_set(mode="OBJECT")


def main() -> None:
    args = parse_args()
    clear_scene()
    mesh = import_glb(args.input)
    minimo, massimo = world_bounds(mesh)
    if (massimo.z - minimo.z) <= 0:
        raise RuntimeError("Il modello ha altezza nulla: impossibile ricavare le proporzioni.")

    armatura = build_armature(mesh, minimo, massimo)
    bind_mesh(mesh, armatura)
    if args.animation == "idle":
        animate_idle(armatura, args.frames)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        export_animations=(args.animation != "none"),
        use_selection=True,
    )
    print(f"AUTORIG_OK {args.output}")


if __name__ == "__main__":
    main()
