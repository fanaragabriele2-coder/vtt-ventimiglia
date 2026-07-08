# hp_to_lp_bake.py — baking automatico High Poly -> Low Poly per Blender 3.6+/4.x (Cycles).
#
# USO (headless, dal terminale del TUO PC con Blender installato):
#   blender -b art/blender/mio_asset.blend --python godot/tools/hp_to_lp_bake.py -- \
#       --hp Statua_HP --lp Statua_LP --out ./godot/art/textures --asset statua \
#       --res 2048 --margin 16 --maps basecolor,normal,ao,roughness,metallic \
#       [--cage Statua_CAGE] [--extrusion 0.05] [--samples 32] [--smoothness] [--pack-orm]
#
# Convenzioni della pipeline (vedi godot/tools/README.md):
#   *_HP    = high poly sorgente (MAI cancellato, MAI esportato nel runtime)
#   *_LP    = low poly game-ready (UV pulite, trasformazioni applicate) — bersaglio del bake
#   *_CAGE  = gabbia opzionale per il selected-to-active
# Output: <out>/<asset>_basecolor.png, <asset>_normal.png, <asset>_ao.png, <asset>_roughness.png,
#         <asset>_metallic.png (+ <asset>_smoothness.png e <asset>_orm.png se richiesti).
#
# NOTE: il metallic non ha un bake nativo in Cycles — viene bakato via EMIT ricablando
# temporaneamente l'input Metallic dei materiali HP su un nodo Emission (e ripristinando tutto).
# Lo script e' pensato per essere IDEMPOTENTE: rilanciarlo sovrascrive solo le texture di output.

import argparse
import os
import sys

import bpy


# --------------------------------------------------------------------------- argomenti

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Bake HP->LP per la pipeline Blender->Godot")
    p.add_argument("--hp", required=True, help="Nome oggetto (o piu' nomi separati da virgola) High Poly")
    p.add_argument("--lp", required=True, help="Nome oggetto Low Poly (bersaglio del bake)")
    p.add_argument("--out", required=True, help="Cartella di output delle texture")
    p.add_argument("--asset", required=True, help="Nome base dell'asset per i file (es. 'statua')")
    p.add_argument("--res", type=int, default=2048, help="Risoluzione texture (default 2048)")
    p.add_argument("--margin", type=int, default=16, help="Margine bake in pixel (default 16)")
    p.add_argument("--maps", default="basecolor,normal,ao,roughness",
                   help="Mappe da bakare, separate da virgola (basecolor,normal,ao,roughness,metallic)")
    p.add_argument("--cage", default="", help="Nome oggetto gabbia (opzionale)")
    p.add_argument("--extrusion", type=float, default=0.05, help="Cage extrusion (default 0.05)")
    p.add_argument("--samples", type=int, default=32, help="Sample Cycles per il bake (default 32)")
    p.add_argument("--gpu", action="store_true", help="Usa la GPU se disponibile")
    p.add_argument("--smoothness", action="store_true", help="Genera anche <asset>_smoothness.png (roughness invertita)")
    p.add_argument("--pack-orm", action="store_true", dest="pack_orm",
                   help="Genera <asset>_orm.png: R=AO, G=Roughness, B=Metallic")
    return p.parse_args(argv)


def fail(msg):
    print("[hp_to_lp_bake] ERRORE: " + msg)
    sys.exit(1)


# --------------------------------------------------------------------------- validazione

def get_object(nome):
    obj = bpy.data.objects.get(nome)
    if obj is None:
        fail("oggetto '%s' non trovato nel .blend (oggetti presenti: %s)"
             % (nome, ", ".join(sorted(o.name for o in bpy.data.objects))))
    if obj.type != "MESH":
        fail("l'oggetto '%s' non e' una mesh (tipo: %s)" % (nome, obj.type))
    return obj


def valida(lp, hp_list):
    if not lp.data.uv_layers:
        fail("il Low Poly '%s' NON ha UV: fai l'unwrap prima del bake" % lp.name)
    if lp.data.uv_layers.active is None:
        fail("il Low Poly '%s' non ha un layer UV attivo" % lp.name)
    for hp in hp_list:
        if hp is lp:
            fail("HP e LP sono lo stesso oggetto ('%s')" % lp.name)
    lp.data.calc_loop_triangles()
    tris_lp = len(lp.data.loop_triangles)
    tris_hp = 0
    for hp in hp_list:
        hp.data.calc_loop_triangles()
        tris_hp += len(hp.data.loop_triangles)
    print("[hp_to_lp_bake] HP: %d tris  ->  LP: %d tris  (riduzione %.1fx)"
          % (tris_hp, tris_lp, (float(tris_hp) / max(1, tris_lp))))


# --------------------------------------------------------------------------- setup bake

def setup_cycles(args):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = args.samples
    if args.gpu:
        sc.cycles.device = "GPU"
    b = sc.render.bake
    b.use_selected_to_active = True
    b.margin = args.margin
    b.cage_extrusion = args.extrusion
    if args.cage:
        cage = bpy.data.objects.get(args.cage)
        if cage is None:
            fail("gabbia '%s' non trovata" % args.cage)
        b.use_cage = True
        b.cage_object = cage
    else:
        b.use_cage = False


def seleziona(hp_list, lp):
    bpy.ops.object.select_all(action="DESELECT")
    for hp in hp_list:
        hp.hide_set(False)
        hp.select_set(True)
    lp.hide_set(False)
    lp.select_set(True)
    bpy.context.view_layer.objects.active = lp


def assicura_materiale_lp(lp):
    """Il bake scrive nell'Image Texture ATTIVO dei materiali del LP: se il LP non ha materiali
    ne crea uno di servizio. Ritorna la lista dei materiali su cui piazzare il nodo immagine."""
    if not lp.data.materials or all(m is None for m in lp.data.materials):
        mat = bpy.data.materials.new(name=lp.name + "_BakeMat")
        mat.use_nodes = True
        lp.data.materials.clear()
        lp.data.materials.append(mat)
    mats = []
    for m in lp.data.materials:
        if m is None:
            continue
        m.use_nodes = True
        mats.append(m)
    return mats


def crea_immagine(nome, res, non_color):
    img = bpy.data.images.get(nome)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(nome, width=res, height=res, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def punta_bake_su(mats, img):
    """Aggiunge (o riusa) un nodo Image Texture con l'immagine di bake e lo rende ATTIVO
    in ogni materiale del LP: e' li' che Cycles scrive il risultato."""
    for m in mats:
        nodes = m.node_tree.nodes
        nodo = nodes.get("BAKE_TARGET")
        if nodo is None:
            nodo = nodes.new("ShaderNodeTexImage")
            nodo.name = "BAKE_TARGET"
            nodo.label = "BAKE_TARGET"
            nodo.location = (-600, -600)
        nodo.image = img
        nodes.active = nodo
        nodo.select = True


# --------------------------------------------------------------------------- metallic via EMIT

def _principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def _output(mat):
    for n in mat.node_tree.nodes:
        if n.type == "OUTPUT_MATERIAL" and n.is_active_output:
            return n
    return None


def prepara_emit_metallic(hp_list):
    """Ricabla temporaneamente ogni materiale HP: l'input Metallic del Principled finisce in un
    nodo Emission collegato all'output. Ritorna i dati per il ripristino."""
    ripristini = []
    for hp in hp_list:
        for slot in hp.material_slots:
            m = slot.material
            if m is None or not m.use_nodes:
                continue
            princ = _principled(m)
            out = _output(m)
            if princ is None or out is None:
                continue
            orig_link = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].links else None
            emit = m.node_tree.nodes.new("ShaderNodeEmission")
            emit.name = "METALLIC_EMIT_TEMP"
            met = princ.inputs["Metallic"]
            if met.links:
                m.node_tree.links.new(met.links[0].from_socket, emit.inputs["Color"])
            else:
                v = float(met.default_value)
                emit.inputs["Color"].default_value = (v, v, v, 1.0)
            m.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
            ripristini.append((m, emit, orig_link, out))
    return ripristini


def ripristina_emit_metallic(ripristini):
    for m, emit, orig_link, out in ripristini:
        if orig_link is not None:
            m.node_tree.links.new(orig_link, out.inputs["Surface"])
        m.node_tree.nodes.remove(emit)


# --------------------------------------------------------------------------- bake + salvataggio

def salva(img, outdir, nome_file):
    percorso = os.path.join(outdir, nome_file)
    img.filepath_raw = percorso
    img.file_format = "PNG"
    img.save()
    print("[hp_to_lp_bake] scritto " + percorso)
    return percorso


def bake_mappa(mappa, args, hp_list, lp, mats, outdir):
    non_color = mappa != "basecolor"
    img = crea_immagine("%s_%s" % (args.asset, mappa), args.res, non_color)
    punta_bake_su(mats, img)
    seleziona(hp_list, lp)

    ripristini = []
    if mappa == "basecolor":
        bpy.context.scene.render.bake.use_pass_direct = False
        bpy.context.scene.render.bake.use_pass_indirect = False
        bpy.context.scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type="DIFFUSE")
    elif mappa == "normal":
        bpy.ops.object.bake(type="NORMAL")
    elif mappa == "ao":
        bpy.ops.object.bake(type="AO")
    elif mappa == "roughness":
        bpy.ops.object.bake(type="ROUGHNESS")
    elif mappa == "metallic":
        ripristini = prepara_emit_metallic(hp_list)
        bpy.ops.object.bake(type="EMIT")
        ripristina_emit_metallic(ripristini)
    else:
        fail("mappa sconosciuta: " + mappa)

    salva(img, outdir, "%s_%s.png" % (args.asset, mappa))
    return img


# --------------------------------------------------------------------------- post-process

def genera_smoothness(img_roughness, args, outdir):
    """Smoothness = 1 - roughness (per pipeline che la preferiscono, es. alcuni shader custom)."""
    img = crea_immagine(args.asset + "_smoothness", args.res, True)
    px = list(img_roughness.pixels)
    for i in range(0, len(px), 4):
        px[i] = 1.0 - px[i]
        px[i + 1] = 1.0 - px[i + 1]
        px[i + 2] = 1.0 - px[i + 2]
    img.pixels = px
    salva(img, outdir, args.asset + "_smoothness.png")


def genera_orm(immagini, args, outdir):
    """Packed ORM — canali documentati: R = AO, G = Roughness, B = Metallic (convenzione glTF)."""
    for chiave in ("ao", "roughness"):
        if chiave not in immagini:
            print("[hp_to_lp_bake] AVVISO: niente ORM, manca la mappa '%s'" % chiave)
            return
    ao = list(immagini["ao"].pixels)
    ro = list(immagini["roughness"].pixels)
    me = list(immagini["metallic"].pixels) if "metallic" in immagini else None
    img = crea_immagine(args.asset + "_orm", args.res, True)
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        px[i] = ao[i]
        px[i + 1] = ro[i + 1]
        px[i + 2] = me[i + 2] if me else 0.0
        px[i + 3] = 1.0
    img.pixels = px
    salva(img, outdir, args.asset + "_orm.png")


# --------------------------------------------------------------------------- main

def main():
    args = parse_args()
    outdir = os.path.abspath(bpy.path.abspath(args.out))
    os.makedirs(outdir, exist_ok=True)

    hp_list = [get_object(n.strip()) for n in args.hp.split(",") if n.strip()]
    lp = get_object(args.lp)
    valida(lp, hp_list)
    setup_cycles(args)
    mats = assicura_materiale_lp(lp)

    mappe = [m.strip().lower() for m in args.maps.split(",") if m.strip()]
    fatte = {}
    for mappa in mappe:
        print("[hp_to_lp_bake] bake %s (%dpx, margin %d)..." % (mappa, args.res, args.margin))
        fatte[mappa] = bake_mappa(mappa, args, hp_list, lp, mats, outdir)

    if args.smoothness and "roughness" in fatte:
        genera_smoothness(fatte["roughness"], args, outdir)
    if args.pack_orm:
        genera_orm(fatte, args, outdir)

    print("[hp_to_lp_bake] COMPLETATO: %d mappe in %s" % (len(fatte), outdir))


if __name__ == "__main__":
    main()
