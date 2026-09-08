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
    monkeypatch.setattr(rigging, "find_blender", lambda: None)
    esito = rigging.autorig_glb(gltf_tools.make_test_cube())
    assert not esito.ok
    assert "blender.org" in esito.message.lower()
    assert "BLENDER_PATH" in esito.message


def test_modello_vuoto_rifiutato(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(rigging, "find_blender", lambda: str(tmp_path))
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
    monkeypatch.setattr(rigging, "find_blender", lambda: str(finto))
    modello = gltf_tools.make_test_cube()

    esito = rigging.autorig_glb(modello, animation="idle", frames=48)

    assert esito.ok, f"{esito.message}\n{esito.log_tail}"
    assert esito.glb.endswith(b"RIGGATO"), "il risultato di Blender deve essere restituito"
    assert "ANIMAZIONE idle FRAMES 48" in esito.log_tail, "argomenti non passati correttamente"


def test_uscita_con_errore_riportata(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, 'import sys\nprint("errore interno", file=sys.stderr)\nsys.exit(3)\n')
    monkeypatch.setattr(rigging, "find_blender", lambda: str(finto))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube())

    assert not esito.ok
    assert "codice 3" in esito.message
    assert "errore interno" in esito.log_tail


def test_nessun_file_prodotto_spiegato(tmp_path, monkeypatch) -> None:
    """Blender può uscire con successo senza scrivere nulla (mesh assente)."""
    finto = _crea_blender_finto(tmp_path, 'print("finito senza scrivere")\n')
    monkeypatch.setattr(rigging, "find_blender", lambda: str(finto))

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
    monkeypatch.setattr(rigging, "find_blender", lambda: str(finto))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube())

    assert not esito.ok and "vuoto" in esito.message


def test_timeout_gestito(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, "import time\ntime.sleep(30)\n")
    monkeypatch.setattr(rigging, "find_blender", lambda: str(finto))

    esito = rigging.autorig_glb(gltf_tools.make_test_cube(), timeout=1.5)

    assert not esito.ok and "terminato entro" in esito.message


def test_i_file_temporanei_vengono_ripuliti(tmp_path, monkeypatch) -> None:
    finto = _crea_blender_finto(tmp_path, CORPO_OK)
    monkeypatch.setattr(rigging, "find_blender", lambda: str(finto))
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
