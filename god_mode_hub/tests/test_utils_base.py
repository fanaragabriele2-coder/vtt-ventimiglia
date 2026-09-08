"""Test delle utilità di base condivise da tutto l'Hub."""

from __future__ import annotations

import pytest

from utils import human_size, slugify


@pytest.mark.parametrize(
    "testo,atteso",
    [
        ("Ser Aldrico di Ventimiglia", "ser_aldrico_di_ventimiglia"),
        ("Goblin  Sciamano!!!", "goblin_sciamano"),
        ("città perché è", "citta_perche_e"),      # accenti normalizzati
        ("---___---", "senza_nome"),               # mai vuoto
        ("", "senza_nome"),
        ("🎨🎬", "senza_nome"),                     # emoji scartate
    ],
)
def test_slugify(testo: str, atteso: str) -> None:
    assert slugify(testo) == atteso


def test_slugify_rispetta_lunghezza_massima() -> None:
    assert len(slugify("a" * 200, max_length=20)) == 20


@pytest.mark.parametrize(
    "byte,atteso",
    [(0, "0 B"), (512, "512 B"), (1536, "1.5 KB"), (1048576, "1.0 MB"), (5368709120, "5.0 GB")],
)
def test_human_size(byte: int, atteso: str) -> None:
    assert human_size(byte) == atteso
