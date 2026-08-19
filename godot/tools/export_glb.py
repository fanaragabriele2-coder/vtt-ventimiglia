# export_glb.py — esporta il LOW POLY con le texture bakate in un .glb pronto per Godot.
#
# USO:  python3 tools/export_glb.py -- --blend art/blender/pilastro_cripta.blend \
#           --lp Pilastro_LP --textures art/textures --asset pilastro_cripta --out art/exports
#       (funziona anche con: blender -b file.blend --python tools/export_glb.py -- ...)
#
# Costruisce sul LP un materiale Principled standard glTF (basecolor sRGB + normal map + roughness
# Non-Color), seleziona SOLO il LP (mai HP/CAGE: regola della pipeline) ed esporta in GLB con le
# texture incorporate. Godot importa il .glb nativamente alla prima apertura del progetto.

import argparse
import os
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Export LP+texture in GLB per Godot")
    p.add_argument("--blend", default="", help="Apri questo .blend prima dell'export")
    p.add_argument("--lp", required=True, help="Nome oggetto Low Poly da esportare")
    p.add_argument("--textures", required=True, help="Cartella con le texture bakate")
    p.add_argument("--asset", required=True, help="Nome base dell'asset (per texture e file)")
    p.add_argument("--out", required=True, help="Cartella di output del .glb")
    return p.parse_args(argv)


def fail(msg):
    print("[export_glb] ERRORE: " + msg)
    sys.exit(1)


def carica_texture(percorso, non_color):
    if not os.path.isfile(percorso):
        return None
    img = bpy.data.images.load(percorso)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def costruisci_materiale(asset, cartella):
    mat = bpy.data.materials.new(asset + "_mat")
    mat.use_nodes = True
    tree = mat.node_tree
    princ = tree.nodes["Principled BSDF"]

    base = carica_texture(os.path.join(cartella, asset + "_basecolor.png"), False)
    if base is None:
        fail("manca %s_basecolor.png in %s (esegui prima hp_to_lp_bake.py)" % (asset, cartella))
    n_base = tree.nodes.new("ShaderNodeTexImage")
    n_base.image = base
    tree.links.new(n_base.outputs["Color"], princ.inputs["Base Color"])

    rough = carica_texture(os.path.join(cartella, asset + "_roughness.png"), True)
    if rough is not None:
        n_rough = tree.nodes.new("ShaderNodeTexImage")
        n_rough.image = rough
        tree.links.new(n_rough.outputs["Color"], princ.inputs["Roughness"])

    normale = carica_texture(os.path.join(cartella, asset + "_normal.png"), True)
    if normale is not None:
        n_norm = tree.nodes.new("ShaderNodeTexImage")
        n_norm.image = normale
        nm = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(n_norm.outputs["Color"], nm.inputs["Color"])
        tree.links.new(nm.outputs["Normal"], princ.inputs["Normal"])
    return mat


def main():
    args = parse_args()
    if args.blend:
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.blend))
    lp = bpy.data.objects.get(args.lp)
    if lp is None:
        fail("oggetto LP '%s' non trovato" % args.lp)

    lp.data.materials.clear()
    lp.data.materials.append(costruisci_materiale(args.asset, os.path.abspath(args.textures)))

    outdir = os.path.abspath(args.out)
    os.makedirs(outdir, exist_ok=True)
    percorso = os.path.join(outdir, args.asset + ".glb")

    bpy.ops.object.select_all(action="DESELECT")
    lp.select_set(True)
    bpy.context.view_layer.objects.active = lp
    bpy.ops.export_scene.gltf(
        filepath=percorso,
        export_format="GLB",
        use_selection=True,          # SOLO il LP: mai HP/CAGE nel runtime
        export_apply=True,           # trasformazioni applicate nell'export
        export_yup=True,             # convenzione glTF/Godot
    )
    print("[export_glb] scritto %s (%d KB)" % (percorso, os.path.getsize(percorso) // 1024))


main()
