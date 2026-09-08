"""Test della pipeline di rigging.

Blender non è installabile in ogni ambiente, ma tutto ciò che sta *intorno*
alla chiamata — rilevamento dell'eseguibile, costruzione degli argomenti,
lettura del risultato, gestione degli errori — si può verificare con un finto
``blender`` che rispetta lo stesso contratto da riga di comando. Resta non
coperto solo il codice ``bpy`` interno allo script, che gira dentro Blender.
"""

from __future__ import annotations

import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from utils import gltf_tools, rigging


# ---------------------------------------------------------------------------
# Rilevamento di Blender
# ---------------------------------------------------------------------------

def test_blender_path_esplicito_ha_la_precedenza(tmp_path, monkeypatch) -> None:
    finto = tmp_path / "blender_finto"
    finto.write_text("", encoding="utf-8")
    monkeypatch.setenv("BLENDER_PATH", str(finto))
    assert rigging.find_blender() == str(finto)
    assert rigging.blender_available() is True


def test_blender_path_inesistente_non_viene_accettato(tmp_path, monkeypatch) -> None:
    """Meglio 'non trovato' che un percorso che fallirà al primo uso."""
    monkeypatch.setenv("BLENDER_PATH", str(tmp_path / "non_esiste.exe"))
    assert rigging.find_blender() is None


def test_senza_blender_messaggio_utile(monkeypatch) -> None:
    """Senza NESSUN backend (né applicazione né modulo bpy) il messaggio deve
    spiegare entrambe le strade per abilitarlo."""
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("", ""))
    esito = rigging.autorig_glb(gltf_tools.make_test_cube())
    assert not esito.ok
    assert "blender.org" in esito.message.lower()
    assert "BLENDER_PATH" in esito.message
    assert "pip install bpy" in esito.message


def test_backend_preferisce_l_applicazione_al_modulo(tmp_path, monkeypatch) -> None:
    """Con entrambi disponibili si usa l'applicazione: è più veloce da avviare."""
    finto = tmp_path / "blender_finto"
    finto.write_text("", encoding="utf-8")
    monkeypatch.setenv("BLENDER_PATH", str(finto))
    monkeypatch.setattr(rigging, "bpy_available", lambda: True)
    assert rigging.blender_backend() == ("app", str(finto))


def test_backend_ricade_sul_modulo_bpy(monkeypatch) -> None:
    monkeypatch.setattr(rigging, "find_blender", lambda: None)
    monkeypatch.setattr(rigging, "bpy_available", lambda: True)
    tipo, eseguibile = rigging.blender_backend()
    assert tipo == "bpy" and eseguibile == sys.executable


def test_modello_vuoto_rifiutato(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(tmp_path)))
    esito = rigging.autorig_glb(b"")
    assert not esito.ok and "Nessun modello" in esito.message


# ---------------------------------------------------------------------------
# Orchestrazione, con un finto Blender
# ---------------------------------------------------------------------------

def _crea_blender_finto(tmp_path: Path, corpo: str) -> Path:
    """Crea un eseguibile che imita il contratto CLI di Blender."""
    script = tmp_path / "blender_finto.py"
    script.write_text(corpo, encoding="utf-8")
    if os.name == "nt":  # pragma: no cover — i test girano su Linux qui
        lanciatore = tmp_path / "blender.bat"
        lanciatore.write_text(f'@echo off\n"{sys.executable}" "{script}" %*\n', encoding="utf-8")
    else:
        lanciatore = tmp_path / "blender"
        lanciatore.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n', encoding="utf-8")
        lanciatore.chmod(lanciatore.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return lanciatore


CORPO_OK = '''
import sys
argv = sys.argv[sys.argv.index("--") + 1:]
opzioni = dict(zip(argv[::2], argv[1::2]))
# Verifica di ricevere gli argomenti attesi, poi scrive un .glb credibile.
assert "--input" in opzioni and "--output" in opzioni, opzioni
dati = open(opzioni["--input"], "rb").read()
assert dati[:4] == b"glTF", "l'Hub deve passare un .glb valido"
open(opzioni["--output"], "wb").write(dati + b"RIGGATO")
print("AUTORIG_OK", opzioni["--output"])
print("ANIMAZIONE", opzioni.get("--animation"), "FRAMES", opzioni.get("--frames"))
'''


def test_rigging_completo_con_blender_finto(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, CORPO_OK)
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(finto)))
    modello = gltf_tools.make_test_cube()

    esito = rigging.autorig_glb(modello, animation="idle", frames=48)

    assert esito.ok, f"{esito.message}\n{esito.log_tail}"
    assert esito.glb.endswith(b"RIGGATO"), "il risultato di Blender deve essere restituito"
    assert "ANIMAZIONE idle FRAMES 48" in esito.log_tail, "argomenti non passati correttamente"


def test_uscita_con_errore_riportata(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, 'import sys\nprint("errore interno", file=sys.stderr)\nsys.exit(3)\n')
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(finto)))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube())

    assert not esito.ok
    assert "codice 3" in esito.message
    assert "errore interno" in esito.log_tail


def test_nessun_file_prodotto_spiegato(tmp_path, monkeypatch) -> None:
    """Blender può uscire con successo senza scrivere nulla (mesh assente)."""
    finto = _crea_blender_finto(tmp_path, 'print("finito senza scrivere")\n')
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(finto)))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube())

    assert not esito.ok
    assert "non ha prodotto il file" in esito.message


def test_file_vuoto_rilevato(tmp_path, monkeypatch) -> None:
    corpo = (
        'import sys\n'
        'argv = sys.argv[sys.argv.index("--") + 1:]\n'
        'o = dict(zip(argv[::2], argv[1::2]))\n'
        'open(o["--output"], "wb").close()\n'
    )
    finto = _crea_blender_finto(tmp_path, corpo)
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(finto)))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube())

    assert not esito.ok and "vuoto" in esito.message


def test_timeout_gestito(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, "import time\ntime.sleep(30)\n")
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(finto)))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube(), timeout=1.5)

    assert not esito.ok and "terminato entro" in esito.message


def test_i_file_temporanei_vengono_ripuliti(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, CORPO_OK)
    monkeypatch.setattr(rigging, "blender_backend", lambda: ("app", str(finto)))
    import tempfile

    prima = set(Path(tempfile.gettempdir()).glob("autorig_*"))
    rigging.autorig_glb(gltf_tools.make_test_cube())
    dopo = set(Path(tempfile.gettempdir()).glob("autorig_*"))

    assert dopo == prima, "le cartelle temporanee devono essere rimosse"


# ---------------------------------------------------------------------------
# Lo script Blender: verificabile staticamente, non eseguibile senza Blender
# ---------------------------------------------------------------------------

def test_script_blender_e_sintatticamente_valido() -> None:
    """`bpy` non è importabile fuori da Blender, ma la sintassi si controlla."""
    import ast

    sorgente = rigging.AUTORIG_SCRIPT.read_text(encoding="utf-8")
    albero = ast.parse(sorgente)
    funzioni = {n.name for n in ast.walk(albero) if isinstance(n, ast.FunctionDef)}
    assert {"main", "build_armature", "bind_mesh", "import_glb"} <= funzioni


def test_script_blender_dichiara_le_ossa_attese() -> None:
    sorgente = rigging.AUTORIG_SCRIPT.read_text(encoding="utf-8")
    for osso in ("bacino", "spina", "torace", "collo", "testa", "braccio_", "coscia_"):
        assert osso in sorgente, f"osso mancante nello script: {osso}"


# ---------------------------------------------------------------------------
# Rigging REALE, quando Blender è davvero disponibile
# ---------------------------------------------------------------------------
# I test qui sopra usano un finto eseguibile e coprono l'orchestrazione. Questi
# eseguono lo script dentro Blender vero: sono l'unica prova che le chiamate
# bpy funzionino. Saltano se né l'applicazione né il modulo `bpy` ci sono.

pytestmark_blender = pytest.mark.skipif(
    not rigging.blender_available(),
    reason="Blender non disponibile (né applicazione né modulo bpy)",
)


def _umanoide_glb(tmp_path: Path) -> bytes:
    """Costruisce un umanoide grezzo con volume: un triangolo non si riggerebbe."""
    script = tmp_path / "crea.py"
    script.write_text(
        "import bpy\n"
        "bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()\n"
        "def c(loc, s):\n"
        "    bpy.ops.mesh.primitive_cube_add(location=loc)\n"
        "    o = bpy.context.object; o.scale = s; return o\n"
        "parti = [c((0,0,1.2),(0.28,0.16,0.45)), c((0,0,1.85),(0.17,0.17,0.19)),\n"
        "         c((0.42,0,1.25),(0.10,0.10,0.38)), c((-0.42,0,1.25),(0.10,0.10,0.38)),\n"
        "         c((0.15,0,0.4),(0.11,0.11,0.42)), c((-0.15,0,0.4),(0.11,0.11,0.42))]\n"
        "bpy.ops.object.select_all(action='DESELECT')\n"
        "for p in parti: p.select_set(True)\n"
        "bpy.context.view_layer.objects.active = parti[0]\n"
        "bpy.ops.object.join()\n"
        "bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)\n"
        f"bpy.ops.export_scene.gltf(filepath={str(tmp_path / 'umanoide.glb')!r}, export_format='GLB')\n",
        encoding="utf-8",
    )
    tipo, eseguibile = rigging.blender_backend()
    comando = ([eseguibile, "--background", "--python", str(script)] if tipo == "app"
               else [eseguibile, str(script)])
    esito = subprocess.run(comando, capture_output=True, text=True, timeout=600, check=False)
    modello = tmp_path / "umanoide.glb"
    assert modello.is_file(), (
        "costruzione del modello di prova fallita — senza di esso il test non "
        f"verificherebbe nulla:\n{(esito.stderr or esito.stdout)[-600:]}"
    )
    return modello.read_bytes()


@pytestmark_blender
def test_rigging_reale_crea_scheletro_e_animazione(tmp_path: Path) -> None:
    """Prova di fondo: lo script bpy produce davvero ossa, pesi e movimento."""
    from utils import gltf_tools

    partenza = _umanoide_glb(tmp_path)
    assert not gltf_tools.inspect_glb(partenza).has_skeleton

    esito = rigging.autorig_glb(partenza, animation="idle", frames=48)

    assert esito.ok, f"{esito.message}\n{esito.log_tail}"
    info = gltf_tools.inspect_glb(esito.glb)
    assert info.has_skeleton, "il modello riggato deve avere uno scheletro"
    assert info.is_animated, "l'animazione idle non è stata esportata"
    assert info.vertex_count == gltf_tools.inspect_glb(partenza).vertex_count, \
        "il rigging non deve alterare la geometria"


@pytestmark_blender
def test_ossa_hanno_i_nomi_previsti(tmp_path: Path) -> None:
    """Le ossa devono corrispondere allo scheletro umanoide dichiarato."""
    try:
        from pygltflib import GLTF2
    except BaseException as exc:  # noqa: BLE001
        pytest.skip(f"pygltflib non disponibile: {type(exc).__name__}")

    esito = rigging.autorig_glb(_umanoide_glb(tmp_path), animation="idle")
    assert esito.ok, esito.message

    percorso = tmp_path / "riggato.glb"
    percorso.write_bytes(esito.glb)
    modello = GLTF2().load(str(percorso))

    assert modello.skins, "nessuno skin nel file esportato"
    nomi = {modello.nodes[j].name for j in modello.skins[0].joints}
    attese = {"bacino", "spina", "torace", "collo", "testa",
              "braccio_L", "braccio_R", "coscia_L", "coscia_R"}
    assert attese <= nomi, f"ossa mancanti: {attese - nomi}"


@pytestmark_blender
def test_solo_scheletro_senza_animazione(tmp_path: Path) -> None:
    from utils import gltf_tools

    esito = rigging.autorig_glb(_umanoide_glb(tmp_path), animation="none")

    assert esito.ok, esito.message
    info = gltf_tools.inspect_glb(esito.glb)
    assert info.has_skeleton
    assert not info.is_animated, "con animation='none' non deve esserci animazione"


@pytestmark_blender
def test_le_ossa_cadono_dentro_gli_arti(tmp_path: Path) -> None:
    """Regressione trovata **guardando un render**, non dai test.

    Le ossa delle braccia finivano dentro il torso invece che negli arti (con
    pesi automatici, deformazioni sbagliate), e un secondo tentativo le ha
    ridotte a monconi di 2 cm perché il filtro verticale troncava la misura.
    Qui si verifica numericamente che l'analisi riconosca gli arti dove sono.

    Geometria nota del modello di prova: braccia centrate a |x| = 0.42 con z da
    0.87 a 1.63; gambe centrate a |x| = 0.15.
    """
    _umanoide_glb(tmp_path)  # crea tmp_path/umanoide.glb

    sonda = tmp_path / "sonda.py"
    sonda.write_text(
        "import bpy, json, sys\n"
        f"sys.path.insert(0, {str(Path(rigging.AUTORIG_SCRIPT).parent)!r})\n"
        "import blender_autorig as ar\n"
        "bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()\n"
        f"bpy.ops.import_scene.gltf(filepath={str(tmp_path / 'umanoide.glb')!r})\n"
        "mesh = [o for o in bpy.context.scene.objects if o.type=='MESH'][0]\n"
        "mi, ma = ar.world_bounds(mesh)\n"
        "a = ar.limb_clusters(mesh, mi, ma)\n"
        "a['altezza'] = ma.z - mi.z\n"
        f"open({str(tmp_path / 'misure.json')!r}, 'w').write(json.dumps(a))\n",
        encoding="utf-8",
    )
    tipo, eseguibile = rigging.blender_backend()
    comando = ([eseguibile, "--background", "--python", str(sonda)] if tipo == "app"
               else [eseguibile, str(sonda)])
    esito_sonda = subprocess.run(comando, capture_output=True, text=True, timeout=600, check=False)

    misure_file = tmp_path / "misure.json"
    assert misure_file.is_file(), (
        "l'analisi degli arti non ha prodotto misure:\n"
        + (esito_sonda.stderr or esito_sonda.stdout)[-800:]
    )
    import json
    m = json.loads(misure_file.read_text(encoding="utf-8"))

    lunghezza_braccio = m["braccio_alto"] - m["braccio_basso"]
    assert lunghezza_braccio > m["altezza"] * 0.25, (
        f"braccio riconosciuto troppo corto ({lunghezza_braccio:.2f} su "
        f"{m['altezza']:.2f} di altezza): le ossa diventerebbero monconi"
    )
    # Verifica decisiva: l'osso deve stare DENTRO la mesh del braccio, che nel
    # modello di prova occupa |x| tra 0.32 e 0.52. Il primo tentativo di questo
    # test accettava da 0.28 e passava anche col bug: il valore di ripiego
    # (0.286) cade nel vuoto tra torso e braccio, cioè fuori da entrambi.
    assert 0.32 <= m["spalla_x"] <= 0.52, (
        f"osso del braccio a |x|={m['spalla_x']:.2f}: fuori dalla mesh del "
        "braccio, che occupa da 0.32 a 0.52. Con i pesi automatici il braccio "
        "si deformerebbe male."
    )
    assert 0.08 <= m["anca_x"] <= 0.26, (
        f"osso della gamba a |x|={m['anca_x']:.2f}: le gambe sono centrate a 0.15"
    )


# ---------------------------------------------------------------------------
# Qualità della deformazione: il rig serve a qualcosa?
# ---------------------------------------------------------------------------
# Ossa nel posto giusto non bastano: contano i **pesi**. Se l'automatic weights
# lega male, muovendo un braccio si trascina il torso o si deforma la testa.
# Qui si ruota un osso e si misura cosa si muove davvero, su una mesh densa e
# continua (metaball) simile a una ricostruzione TripoSR — non su cubi
# separati, dove i pesi risulterebbero puliti per costruzione.

_SCRIPT_UMANOIDE_ORGANICO = """
import bpy
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.object.metaball_add(type='BALL', location=(0,0,1.25), radius=0.42)
mb = bpy.context.object
def palla(x, z, r):
    e = mb.data.elements.new(type='BALL'); e.co = (x, 0, z-1.25); e.radius = r
for z in (0.95, 1.10, 1.40): palla(0, z, 0.40)
palla(0, 1.80, 0.30)
for s in (1, -1):
    for t, (z, r) in enumerate([(1.45,0.22),(1.25,0.20),(1.05,0.18),(0.90,0.16)]):
        palla(s*(0.30+0.03*t), z, r)
    for z, r in [(0.70,0.24),(0.50,0.22),(0.28,0.20),(0.08,0.18)]:
        palla(s*0.17, z, r)
mb.data.resolution = 0.06
bpy.context.view_layer.update()
bpy.ops.object.convert(target='MESH')
bpy.ops.export_scene.gltf(filepath=USCITA, export_format='GLB')
"""

_SCRIPT_MISURA_DEFORMAZIONE = """
import bpy, json, math
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=INGRESSO)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]

def posizioni():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    m = ev.matrix_world
    return [m @ v.co for v in ev.data.vertices]

riposo = posizioni()
meta = (max(p.x for p in riposo) + min(p.x for p in riposo)) / 2
estremo = max(abs(p.x - meta) for p in riposo)

zone = {
    'braccio_ruotato': [i for i, p in enumerate(riposo) if p.x-meta >  estremo*0.55 and p.z > 0.85],
    'braccio_opposto': [i for i, p in enumerate(riposo) if p.x-meta < -estremo*0.55 and p.z > 0.85],
    'testa':           [i for i, p in enumerate(riposo) if p.z > 1.85],
    'gambe':           [i for i, p in enumerate(riposo) if p.z < 0.55],
    'vita':            [i for i, p in enumerate(riposo) if abs(p.x-meta) < estremo*0.25 and 0.85 <= p.z < 1.05],
}

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
osso = arm.pose.bones['braccio_L']
osso.rotation_mode = 'XYZ'
osso.rotation_euler[1] = math.radians(50)
bpy.context.view_layer.update()
dopo = posizioni()
bpy.ops.object.mode_set(mode='OBJECT')

esito = {'vertici': len(riposo)}
for nome, indici in zone.items():
    esito[nome] = (sum((dopo[i]-riposo[i]).length for i in indici) / len(indici)) if indici else None
    esito[nome + '_n'] = len(indici)
open(RISULTATO, 'w').write(json.dumps(esito))
"""


def _esegui_in_blender(script: str, tmp_path: Path, **variabili) -> subprocess.CompletedProcess:
    """Esegue uno script dentro Blender, iniettando le variabili come costanti.

    Restituisce l'esito completo: se lo script fallisce, il test deve poter
    **fallire con l'errore vero** invece di saltare. Un `skip` al posto di un
    `fail` nasconde i guasti dietro una suite che sembra verde — verificato
    sulla mia stessa pelle rompendo di proposito i pesi dell'armatura: il test
    saltava invece di segnalare.
    """
    intestazione = "".join(f"{nome} = {valore!r}\n" for nome, valore in variabili.items())
    percorso = tmp_path / f"script_blender_{abs(hash(script)) % 10000}.py"
    percorso.write_text(intestazione + script, encoding="utf-8")
    tipo, eseguibile = rigging.blender_backend()
    comando = ([eseguibile, "--background", "--python", str(percorso)] if tipo == "app"
               else [eseguibile, str(percorso)])
    return subprocess.run(comando, capture_output=True, text=True, timeout=900, check=False)


@pytestmark_blender
def test_i_pesi_muovono_solo_l_arto_giusto(tmp_path: Path) -> None:
    """Ruotando l'osso di un braccio, deve muoversi quel braccio e basta.

    È la prova che il rig sia utilizzabile e non solo strutturalmente valido:
    con pesi legati male, muovere un braccio trascinerebbe il torso o la testa.
    """
    import json

    organico = tmp_path / "organico.glb"
    esito = _esegui_in_blender(_SCRIPT_UMANOIDE_ORGANICO, tmp_path, USCITA=str(organico))
    assert organico.is_file(), (
        "costruzione del modello di prova fallita:\n" + (esito.stderr or esito.stdout)[-800:]
    )
    assert len(organico.read_bytes()) > 10_000, "la mesh di prova deve essere densa"

    esito_rig = rigging.autorig_glb(organico.read_bytes(), animation="none")
    assert esito_rig.ok, f"{esito_rig.message}\n{esito_rig.log_tail}"
    riggato = tmp_path / "riggato.glb"
    riggato.write_bytes(esito_rig.glb)

    risultato = tmp_path / "deformazione.json"
    esito = _esegui_in_blender(
        _SCRIPT_MISURA_DEFORMAZIONE, tmp_path,
        INGRESSO=str(riggato), RISULTATO=str(risultato),
    )
    # Niente skip qui: se la misura non riesce è perché il modello riggato è
    # inutilizzabile (per esempio senza armatura), cioè proprio il guasto che
    # questo test deve intercettare.
    assert risultato.is_file(), (
        "impossibile misurare la deformazione del modello riggato — il rig "
        "prodotto non è utilizzabile:\n" + (esito.stderr or esito.stdout)[-800:]
    )
    m = json.loads(risultato.read_text(encoding="utf-8"))

    assert m["vertici"] > 500, f"mesh troppo rada per essere significativa: {m['vertici']}"
    assert m["braccio_ruotato"] and m["braccio_ruotato"] > 0.02, (
        f"il braccio non segue il proprio osso (spostamento {m['braccio_ruotato']}): "
        "i pesi non sono stati assegnati"
    )
    assert m["braccio_opposto"] is not None and m["braccio_opposto"] < 0.001, (
        f"l'altro braccio si muove ({m['braccio_opposto']:.4f}): pesi sconfinati"
    )
    assert m["testa"] is not None and m["testa"] < 0.001, (
        f"la testa si muove ({m['testa']:.4f}) ruotando un braccio"
    )
    assert m["gambe"] is not None and m["gambe"] < 0.001, (
        f"le gambe si muovono ({m['gambe']:.4f}) ruotando un braccio"
    )
    # L'influenza deve svanire allontanandosi dalla spalla: alla vita, quasi nulla.
    assert m["vita"] is not None and m["vita"] < m["braccio_ruotato"] * 0.15, (
        f"l'influenza del braccio arriva fino alla vita ({m['vita']:.4f} contro "
        f"{m['braccio_ruotato']:.4f} del braccio): i pesi sono troppo diffusi"
    )
