"""Script Blender: rigging automatico di un .glb e animazione idle.

Eseguito da ``utils/rigging.py`` come:

    blender --background --python tools/blender_autorig.py -- \
            --input modello.glb --output riggato.glb [--animation idle]

Cosa fa, in ordine:

1. importa il ``.glb`` in una scena vuota;
2. misura il riquadro di ingombro della mesh e ne ricava le proporzioni di un
   umanoide in posa A (quella che i prompt dell'Hub chiedono a Stable
   Diffusion, ed è la posa su cui TripoSR ricostruisce meglio);
3. crea un'armatura con le ossa principali (bacino, spina, torace, collo,
   testa, braccia, gambe) posizionate su quelle proporzioni;
4. imparenta la mesh all'armatura con i **pesi automatici** di Blender;
5. applica un'animazione di base e riesporta in ``.glb``.

Limite dichiarato: le proporzioni vengono dal riquadro di ingombro, non da un
riconoscimento della forma. Su un umanoide in posa A il risultato è
utilizzabile; su una creatura molto diversa (quadrupede, ameba, drago) le ossa
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


def build_armature(minimo: Vector, massimo: Vector):
    """Crea l'armatura umanoide proporzionata al riquadro di ingombro.

    Le frazioni di altezza seguono il canone anatomico usato di norma nel
    character rigging (bacino ~0.53, spalle ~0.82, testa ~0.93).
    """
    altezza = massimo.z - minimo.z
    larghezza = massimo.x - minimo.x
    centro_x = (massimo.x + minimo.x) / 2
    centro_y = (massimo.y + minimo.y) / 2
    base_z = minimo.z

    def punto(frazione_altezza: float, scarto_x: float = 0.0) -> Vector:
        return Vector((centro_x + scarto_x, centro_y, base_z + altezza * frazione_altezza))

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

    # Arti, speculari sui due lati
    spalla_x = larghezza * 0.18
    anca_x = larghezza * 0.10
    for lato, segno in (("L", 1.0), ("R", -1.0)):
        braccio = nuovo(f"braccio_{lato}", punto(0.80, segno * spalla_x),
                        punto(0.68, segno * spalla_x * 1.7), torace)
        nuovo(f"avambraccio_{lato}", punto(0.68, segno * spalla_x * 1.7),
              punto(0.56, segno * spalla_x * 2.1), braccio, True)
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

    def chiave(nome_osso: str, frame: int, rotazione_x: float) -> None:
        osso = ossa.get(nome_osso)
        if osso is None:
            return
        osso.rotation_mode = "XYZ"
        osso.rotation_euler[0] = rotazione_x
        osso.keyframe_insert(data_path="rotation_euler", frame=frame)

    meta = frames // 2
    for nome, ampiezza in (("spina", 0.035), ("torace", 0.025),
                           ("braccio_L", 0.05), ("braccio_R", 0.05)):
        chiave(nome, 1, 0.0)
        chiave(nome, meta, math.radians(ampiezza * 180 / math.pi))
        chiave(nome, frames, 0.0)  # chiude il ciclo: nessuno scatto al loop

    bpy.ops.object.mode_set(mode="OBJECT")


def main() -> None:
    args = parse_args()
    clear_scene()
    mesh = import_glb(args.input)
    minimo, massimo = world_bounds(mesh)
    if (massimo.z - minimo.z) <= 0:
        raise RuntimeError("Il modello ha altezza nulla: impossibile ricavare le proporzioni.")

    armatura = build_armature(minimo, massimo)
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
