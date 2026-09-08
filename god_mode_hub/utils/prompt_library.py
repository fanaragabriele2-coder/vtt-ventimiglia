"""Libreria dei prompt che hanno funzionato.

Generare un buon token richiede qualche tentativo: trovata la formulazione
giusta, riscriverla a memoria la volta dopo è tempo perso (e il risultato non
è più lo stesso). Qui i prompt riusciti si salvano con i loro parametri e si
riusano con un click.

Archivio: un singolo JSON in ``prompt_library.json``, leggibile e modificabile
a mano, versionabile con git.
"""

from __future__ import annotations

import datetime as _dt
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from utils import HUB_ROOT, slugify

LIBRARY_PATH = HUB_ROOT / "prompt_library.json"

#: Categorie previste, allineate alle pagine che generano immagini.
CATEGORIES: tuple[str, ...] = ("token", "personaggio", "animazione")


@dataclass
class SavedPrompt:
    """Un prompt salvato con i parametri che lo hanno prodotto."""

    id: str
    name: str
    category: str
    subject: str
    params: dict[str, Any] = field(default_factory=dict)
    created: str = ""
    used_count: int = 0

    @classmethod
    def create(
        cls,
        name: str,
        category: str,
        subject: str,
        params: dict[str, Any] | None = None,
    ) -> SavedPrompt:
        return cls(
            id=f"{slugify(name)}_{_dt.datetime.now().strftime('%Y%m%d%H%M%S')}",
            name=name.strip() or "senza nome",
            category=category,
            subject=subject.strip(),
            params=params or {},
            created=_dt.datetime.now().isoformat(timespec="seconds"),
        )


def _resolve(path: Path | None) -> Path:
    """Percorso effettivo dell'archivio.

    Risolto a ogni chiamata invece di essere legato al valore di default:
    così ``LIBRARY_PATH`` resta sostituibile (test isolati, archivi
    alternativi) senza che le funzioni continuino a puntare al file reale.
    """
    return path if path is not None else LIBRARY_PATH


def _load_raw(path: Path | None = None) -> list[dict[str, Any]]:
    """Legge l'archivio, tollerando file assente o corrotto."""
    path = _resolve(path)
    if not path.is_file():
        return []
    try:
        dati = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    return dati if isinstance(dati, list) else []


def load_prompts(
    category: str | None = None,
    path: Path | None = None,
) -> list[SavedPrompt]:
    """Prompt salvati, dal più recente.

    Args:
        category: filtra per categoria; ``None`` per tutte.
    """
    prompts: list[SavedPrompt] = []
    for voce in _load_raw(path):
        try:
            prompt = SavedPrompt(**voce)
        except TypeError:
            continue  # voce scritta a mano male: saltata, non fatale
        if category is None or prompt.category == category:
            prompts.append(prompt)
    return sorted(prompts, key=lambda p: p.created, reverse=True)


def _write(prompts: list[SavedPrompt], path: Path | None = None) -> None:
    path = _resolve(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([asdict(p) for p in prompts], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def save_prompt(
    name: str,
    category: str,
    subject: str,
    params: dict[str, Any] | None = None,
    path: Path | None = None,
) -> SavedPrompt:
    """Aggiunge un prompt alla libreria.

    Raises:
        ValueError: soggetto vuoto o categoria sconosciuta.
    """
    if not subject.strip():
        raise ValueError("Il soggetto del prompt non può essere vuoto.")
    if category not in CATEGORIES:
        raise ValueError(f"Categoria sconosciuta: {category!r} (attese: {CATEGORIES}).")
    prompt = SavedPrompt.create(name, category, subject, params)
    tutti = load_prompts(path=path)
    tutti.insert(0, prompt)
    _write(tutti, path)
    return prompt


def delete_prompt(prompt_id: str, path: Path | None = None) -> bool:
    """Elimina un prompt.

    Returns:
        True se esisteva ed è stato rimosso.
    """
    tutti = load_prompts(path=path)
    rimasti = [p for p in tutti if p.id != prompt_id]
    if len(rimasti) == len(tutti):
        return False
    _write(rimasti, path)
    return True


def mark_used(prompt_id: str, path: Path | None = None) -> None:
    """Incrementa il contatore d'uso, per far emergere i prompt migliori."""
    tutti = load_prompts(path=path)
    for prompt in tutti:
        if prompt.id == prompt_id:
            prompt.used_count += 1
            _write(tutti, path)
            return


def most_used(category: str | None = None, limit: int = 5,
              path: Path | None = None) -> list[SavedPrompt]:
    """I prompt riusati più spesso: di fatto quelli che funzionano."""
    prompts = load_prompts(category, path)
    return sorted(prompts, key=lambda p: p.used_count, reverse=True)[:limit]
