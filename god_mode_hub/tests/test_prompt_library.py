"""Test della libreria dei prompt riutilizzabili."""

from __future__ import annotations

from pathlib import Path

import pytest

from utils import prompt_library as pl


@pytest.fixture
def archivio(tmp_path: Path) -> Path:
    return tmp_path / "prompt_library.json"


def test_salva_e_rilegge(archivio: Path) -> None:
    salvato = pl.save_prompt("Goblin buono", "token", "goblin sciamano con bastone",
                             {"steps": 30}, path=archivio)
    riletti = pl.load_prompts(path=archivio)

    assert len(riletti) == 1
    assert riletti[0].id == salvato.id
    assert riletti[0].subject == "goblin sciamano con bastone"
    assert riletti[0].params["steps"] == 30


def test_archivio_assente_restituisce_lista_vuota(archivio: Path) -> None:
    assert pl.load_prompts(path=archivio) == []


def test_archivio_corrotto_non_esplode(archivio: Path) -> None:
    archivio.write_text("{ questo non è JSON valido", encoding="utf-8")
    assert pl.load_prompts(path=archivio) == []


def test_voce_malformata_saltata_senza_perdere_le_altre(archivio: Path) -> None:
    pl.save_prompt("Buono", "token", "un soggetto", path=archivio)
    dati = archivio.read_text(encoding="utf-8")
    archivio.write_text(dati.replace("[", '[{"campo_inventato": 1},', 1), encoding="utf-8")

    riletti = pl.load_prompts(path=archivio)

    assert len(riletti) == 1 and riletti[0].name == "Buono"


def test_filtro_per_categoria(archivio: Path) -> None:
    pl.save_prompt("A", "token", "x", path=archivio)
    pl.save_prompt("B", "personaggio", "y", path=archivio)

    assert len(pl.load_prompts("token", path=archivio)) == 1
    assert len(pl.load_prompts(path=archivio)) == 2


def test_soggetto_vuoto_rifiutato(archivio: Path) -> None:
    with pytest.raises(ValueError, match="vuoto"):
        pl.save_prompt("X", "token", "   ", path=archivio)


def test_categoria_sconosciuta_rifiutata(archivio: Path) -> None:
    with pytest.raises(ValueError, match="Categoria"):
        pl.save_prompt("X", "inventata", "soggetto", path=archivio)


def test_eliminazione(archivio: Path) -> None:
    salvato = pl.save_prompt("Da eliminare", "token", "x", path=archivio)
    assert pl.delete_prompt(salvato.id, path=archivio) is True
    assert pl.load_prompts(path=archivio) == []
    assert pl.delete_prompt("id_inesistente", path=archivio) is False


def test_contatore_uso_e_classifica(archivio: Path) -> None:
    poco = pl.save_prompt("Poco usato", "token", "x", path=archivio)
    molto = pl.save_prompt("Molto usato", "token", "y", path=archivio)

    for _ in range(3):
        pl.mark_used(molto.id, path=archivio)
    pl.mark_used(poco.id, path=archivio)

    classifica = pl.most_used("token", path=archivio)
    assert classifica[0].name == "Molto usato"
    assert classifica[0].used_count == 3


def test_ordine_dal_piu_recente(archivio: Path) -> None:
    import time
    pl.save_prompt("Primo", "token", "a", path=archivio)
    time.sleep(1.05)  # gli id/created hanno risoluzione al secondo
    pl.save_prompt("Secondo", "token", "b", path=archivio)
    assert pl.load_prompts(path=archivio)[0].name == "Secondo"
