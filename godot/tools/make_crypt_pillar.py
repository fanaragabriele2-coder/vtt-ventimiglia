# make_crypt_pillar.py — costruisce l'asset di riferimento della pipeline: il Pilastro della Cripta.
#
# USO:  blender -b --python godot/tools/make_crypt_pillar.py
#
# Produce godot/art/blender/pilastro_cripta.blend con:
#   Pilastro_HP  — high poly (bevel + subsurf + displacement "pietra"), con materiale procedurale
#   Pilastro_LP  — low poly game-ready (stessa silhouette, UV smart-project)
# E' il .blend su cui hp_to_lp_bake.py viene collaudato end-to-end.

import math
import os

import bpy


def pulisci_scena():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def crea_base() -> bpy.types.Object:
    """Fusto + plinto + capitello, uniti in un'unica mesh con pivot alla base (z=0)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.32, depth=2.6, location=(0, 0, 1.45))
    fusto = bpy.context.active_object
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.075))
    plinto = bpy.context.active_object
    plinto.scale = (0.5, 0.5, 0.075)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 2.825))
    capitello = bpy.context.active_object
    capitello.scale = (0.46, 0.46, 0.075)

    bpy.ops.object.select_all(action="DESELECT")
    for o in (fusto, plinto, capitello):
        o.select_set(True)
    bpy.context.view_layer.objects.active = fusto
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    base = bpy.context.active_object
    base.name = "Pilastro_BASE"
    return base


def materiale_pietra() -> bpy.types.Material:
    """Pietra procedurale (noise -> color ramp): e' cio' che il bake trasferira' nella basecolor."""
    mat = bpy.data.materials.new("StonePillar_HP")
    mat.use_nodes = True
    tree = mat.node_tree
    princ = tree.nodes["Principled BSDF"]
    princ.inputs["Roughness"].default_value = 0.9
    princ.inputs["Metallic"].default_value = 0.0
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 6.0
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.16, 0.15, 0.14, 1.0)
    ramp.color_ramp.elements[1].color = (0.42, 0.40, 0.36, 1.0)
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], princ.inputs["Base Color"])
    return mat


def main():
    pulisci_scena()
    base = crea_base()

    # LP: copia della base PRIMA dei modificatori pesanti — stessa silhouette, poligoni minimi.
    lp = base.copy()
    lp.data = base.data.copy()
    lp.name = "Pilastro_LP"
    bpy.context.collection.objects.link(lp)

    # HP: bevel + subsurf + displacement (il dettaglio che diventera' normal/AO baked).
    hp = base
    hp.name = "Pilastro_HP"
    bev = hp.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.02
    bev.segments = 2
    sub = hp.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = 3
    sub.render_levels = 3
    tex = bpy.data.textures.new("StoneNoise", "CLOUDS")
    tex.noise_scale = 0.35
    disp = hp.modifiers.new("Displace", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.03
    bpy.ops.object.select_all(action="DESELECT")
    hp.select_set(True)
    bpy.context.view_layer.objects.active = hp
    for nome in ("Bevel", "Subsurf", "Displace"):
        bpy.ops.object.modifier_apply(modifier=nome)
    hp.data.materials.append(materiale_pietra())

    # UV pulite sul LP (smart project): e' il prerequisito che hp_to_lp_bake.py valida.
    bpy.ops.object.select_all(action="DESELECT")
    lp.select_set(True)
    bpy.context.view_layer.objects.active = lp
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

    for o in (hp, lp):
        o.data.calc_loop_triangles()
        print("[make_crypt_pillar] %s: %d tris" % (o.name, len(o.data.loop_triangles)))

    out = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "art", "blender", "pilastro_cripta.blend"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("[make_crypt_pillar] salvato " + out)


main()
