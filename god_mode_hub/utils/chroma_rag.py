"""RAG locale con ChromaDB + all-MiniLM-L6-v2, su due sorgenti reali:

* ``codebase/`` — futuro riscritto Flutter (``.dart``/``.py``), vuoto finché
  non lo avvii;
* il **progetto VTT attuale di questo repo** (``.js``/``.html``/``.css``:
  ``index.html``, ``css/``, ``js/``, ``tools/``) — la codebase reale su cui
  lavorare oggi.

ChromaDB e sentence-transformers vengono importati in modo *pigro*: se non
sono installati (o l'indice non esiste ancora) l'Hub resta utilizzabile e le
query ricadono automaticamente su una ricerca full-text ingenua sui file di
entrambe le sorgenti (:func:`fts_fallback_search`). Nessuna chiamata di rete:
embeddings e indice vivono su disco in ``chroma_index/``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator, Sequence

from utils import CHROMA_DIR, CODEBASE_DIR, VTT_PROJECT_DIR, ensure_dirs

COLLECTION_NAME = "flutter_codebase"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
DEFAULT_EXTENSIONS: tuple[str, ...] = (".dart", ".py")
CHUNK_LINES = 80
CHUNK_OVERLAP = 15
MAX_FILE_BYTES = 512_000
UPSERT_BATCH = 128

VTT_EXTENSIONS: tuple[str, ...] = (".js", ".html", ".css")

#: Cartelle da escludere quando si scansiona VTT_PROJECT_DIR (che è la radice
#: dell'intero repo, non una cartella sorgente dedicata).
EXCLUDED_DIR_NAMES: frozenset[str] = frozenset({
    "god_mode_hub", "node_modules", ".git", ".claude",
    "dist", "legacy", ".venv", "chroma_index", "__pycache__",
})


@dataclass(frozen=True)
class RagHit:
    """Singolo risultato di una query RAG."""

    path: str
    snippet: str
    score: float
    start_line: int
    source: str  # "chroma" oppure "fts"
    project: str = "codebase"  # "codebase" (Flutter futuro) oppure "vtt_web" (JS/HTML/CSS)


@dataclass
class IngestStats:
    """Statistiche di una passata di indicizzazione."""

    files: int = 0
    chunks: int = 0
    skipped: list[str] = field(default_factory=list)


def is_available() -> bool:
    """True se ChromaDB è importabile in questo ambiente."""
    try:
        import chromadb  # noqa: F401
    except Exception:
        return False
    return True


@lru_cache(maxsize=1)
def _get_collection() -> Any:
    """Restituisce (creandola se serve) la collection persistente ChromaDB.

    Il primo accesso scarica/carica il modello di embedding locale
    all-MiniLM-L6-v2, quindi può richiedere qualche secondo.
    """
    import chromadb
    from chromadb.utils import embedding_functions

    ensure_dirs()
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )
    return client.get_or_create_collection(
        COLLECTION_NAME,
        embedding_function=embedder,
        metadata={"hnsw:space": "cosine"},
    )


def reset_collection() -> None:
    """Elimina l'indice ChromaDB (verrà ricreato alla prossima ingest)."""
    import chromadb

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass  # la collection potrebbe non esistere ancora
    _get_collection.cache_clear()


def collection_count() -> int:
    """Numero di chunk attualmente indicizzati (0 se Chroma non disponibile)."""
    if not is_available():
        return 0
    try:
        return int(_get_collection().count())
    except Exception:
        return 0


def iter_source_files(
    root: Path = CODEBASE_DIR,
    extensions: Sequence[str] = DEFAULT_EXTENSIONS,
    exclude_dirs: frozenset[str] = frozenset(),
) -> Iterator[Path]:
    """Itera i file sorgente indicizzabili sotto ``root`` (ricorsivo).

    ``exclude_dirs`` salta qualunque file la cui cartella (a qualsiasi
    profondità sotto ``root``) abbia uno di questi nomi — usato per
    scansionare la radice dell'intero repo evitando ``.git``, ``god_mode_hub``,
    ``node_modules``, ecc.
    """
    if not root.exists():
        return
    for path in sorted(root.rglob("*")):
        if not (path.is_file() and path.suffix.lower() in extensions):
            continue
        if exclude_dirs:
            rel_parts = path.relative_to(root).parts[:-1]
            if any(part in exclude_dirs for part in rel_parts):
                continue
        yield path


def chunk_text(
    text: str,
    chunk_lines: int = CHUNK_LINES,
    overlap: int = CHUNK_OVERLAP,
) -> list[tuple[str, int]]:
    """Divide un sorgente in chunk di righe sovrapposti.

    Returns:
        Lista di tuple ``(testo_chunk, riga_iniziale_1_based)``.
    """
    lines = text.splitlines()
    if not lines:
        return []
    step = max(chunk_lines - overlap, 1)
    chunks: list[tuple[str, int]] = []
    for start in range(0, len(lines), step):
        window = lines[start : start + chunk_lines]
        chunk = "\n".join(window).strip()
        if chunk:
            chunks.append((chunk, start + 1))
        if start + chunk_lines >= len(lines):
            break
    return chunks


def _ingest_into_collection(
    root: Path,
    extensions: Sequence[str],
    project: str,
    exclude_dirs: frozenset[str] = frozenset(),
) -> IngestStats:
    """Indicizza i file di ``root`` nella collection Chroma, taggati ``project``."""
    collection = _get_collection()
    stats = IngestStats()
    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []

    def _flush() -> None:
        if ids:
            collection.upsert(ids=list(ids), documents=list(documents), metadatas=list(metadatas))
            ids.clear()
            documents.clear()
            metadatas.clear()

    for path in iter_source_files(root, extensions, exclude_dirs=exclude_dirs):
        rel = path.relative_to(root).as_posix()
        if path.stat().st_size > MAX_FILE_BYTES:
            stats.skipped.append(f"{rel} (troppo grande)")
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            stats.skipped.append(f"{rel} ({exc})")
            continue
        file_chunks = chunk_text(text)
        if not file_chunks:
            continue
        stats.files += 1
        for chunk, start_line in file_chunks:
            ids.append(f"{project}::{rel}::{start_line}")
            documents.append(chunk)
            metadatas.append(
                {"path": rel, "start_line": start_line, "ext": path.suffix, "project": project}
            )
            stats.chunks += 1
            if len(ids) >= UPSERT_BATCH:
                _flush()
    _flush()
    return stats


def ingest_codebase(
    root: Path = CODEBASE_DIR,
    extensions: Sequence[str] = DEFAULT_EXTENSIONS,
    full_reset: bool = True,
) -> IngestStats:
    """Indicizza ``codebase/`` (riscritto Flutter futuro) in ChromaDB.

    Args:
        root: cartella radice da scansionare.
        extensions: estensioni file da includere.
        full_reset: se True ricrea l'indice da zero (evita chunk orfani di
            file cancellati); se False fa solo upsert incrementale.

    Raises:
        ImportError: se ChromaDB non è installato.
    """
    if not is_available():
        raise ImportError(
            "chromadb non è installato: esegui `pip install -r requirements.txt`."
        )
    if full_reset:
        reset_collection()
    return _ingest_into_collection(root, extensions, project="codebase")


def ingest_vtt_project(
    root: Path = VTT_PROJECT_DIR,
    extensions: Sequence[str] = VTT_EXTENSIONS,
    exclude_dirs: frozenset[str] = EXCLUDED_DIR_NAMES,
    full_reset: bool = False,
) -> IngestStats:
    """Indicizza il progetto VTT attuale (``.js``/``.html``/``.css``) in ChromaDB.

    Scansiona la radice del repo (``VTT_PROJECT_DIR``), che è la cartella
    padre di ``god_mode_hub``, escludendo ``exclude_dirs``.

    Raises:
        ImportError: se ChromaDB non è installato.
    """
    if not is_available():
        raise ImportError(
            "chromadb non è installato: esegui `pip install -r requirements.txt`."
        )
    if full_reset:
        reset_collection()
    return _ingest_into_collection(root, extensions, project="vtt_web", exclude_dirs=exclude_dirs)


def ingest_all(full_reset: bool = True) -> dict[str, IngestStats]:
    """Reindicizza sia ``codebase/`` sia il progetto VTT (JS/HTML/CSS) attuale.

    Returns:
        Statistiche per progetto: ``{"codebase": ..., "vtt_web": ...}``.
    """
    if not is_available():
        raise ImportError(
            "chromadb non è installato: esegui `pip install -r requirements.txt`."
        )
    if full_reset:
        reset_collection()
    return {
        "codebase": _ingest_into_collection(CODEBASE_DIR, DEFAULT_EXTENSIONS, project="codebase"),
        "vtt_web": _ingest_into_collection(
            VTT_PROJECT_DIR, VTT_EXTENSIONS, project="vtt_web", exclude_dirs=EXCLUDED_DIR_NAMES
        ),
    }


def query_codebase(
    question: str,
    top_k: int = 10,
    root: Path = CODEBASE_DIR,
) -> list[RagHit]:
    """Interroga la codebase: ChromaDB se disponibile, altrimenti fallback FTS.

    La query vettoriale copre automaticamente sia ``codebase/`` sia il
    progetto VTT (stessa collection, tag ``project`` diverso). Il fallback
    full-text scansiona esplicitamente entrambe le sorgenti e fonde i
    risultati. Il fallback scatta anche quando l'indice esiste ma è vuoto o
    la query vettoriale fallisce, così la pagina Streamlit non si rompe mai.
    """
    question = question.strip()
    if not question:
        return []
    if is_available():
        try:
            collection = _get_collection()
            if collection.count() > 0:
                result = collection.query(
                    query_texts=[question],
                    n_results=top_k,
                    include=["documents", "metadatas", "distances"],
                )
                hits = _hits_from_chroma(result)
                if hits:
                    return hits
        except Exception:
            pass  # qualunque problema vettoriale -> fallback testuale

    combined = fts_fallback_search(question, top_k=top_k, root=root, project="codebase")
    combined += fts_fallback_search(
        question,
        top_k=top_k,
        root=VTT_PROJECT_DIR,
        extensions=VTT_EXTENSIONS,
        exclude_dirs=EXCLUDED_DIR_NAMES,
        project="vtt_web",
    )
    combined.sort(key=lambda hit: hit.score, reverse=True)
    return combined[:top_k]


def _hits_from_chroma(result: dict[str, Any]) -> list[RagHit]:
    """Converte la risposta grezza di ``collection.query`` in :class:`RagHit`."""
    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    dists = (result.get("distances") or [[]])[0]
    hits: list[RagHit] = []
    for i, doc in enumerate(docs):
        meta = metas[i] if i < len(metas) else {}
        distance = float(dists[i]) if i < len(dists) else 1.0
        hits.append(
            RagHit(
                path=str(meta.get("path", "?")),
                snippet=doc,
                score=round(1.0 / (1.0 + distance), 4),
                start_line=int(meta.get("start_line", 1)),
                source="chroma",
                project=str(meta.get("project", "codebase")),
            )
        )
    return hits


def _tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-zA-Z0-9_]+", text.lower()) if len(t) > 1]


def fts_fallback_search(
    question: str,
    top_k: int = 10,
    root: Path = CODEBASE_DIR,
    extensions: Sequence[str] = DEFAULT_EXTENSIONS,
    context_lines: int = 6,
    exclude_dirs: frozenset[str] = frozenset(),
    project: str = "codebase",
) -> list[RagHit]:
    """Ricerca full-text ingenua sui file (nessuna dipendenza esterna).

    Ordina i file per numero di occorrenze dei token della query e restituisce
    uno snippet centrato sulla riga con più match. Usata come rete di
    sicurezza quando ChromaDB non è disponibile.
    """
    tokens = _tokenize(question)
    if not tokens:
        return []
    scored: list[tuple[float, Path, int]] = []  # (score, path, best_line_idx)
    for path in iter_source_files(root, extensions, exclude_dirs=exclude_dirs):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        lower = text.lower()
        score = float(sum(lower.count(tok) for tok in tokens))
        if score <= 0:
            continue
        best_line, best_count = 0, -1
        for idx, line in enumerate(lower.splitlines()):
            count = sum(1 for tok in tokens if tok in line)
            if count > best_count:
                best_line, best_count = idx, count
        scored.append((score, path, best_line))
    scored.sort(key=lambda item: item[0], reverse=True)

    hits: list[RagHit] = []
    max_score = scored[0][0] if scored else 1.0
    for score, path, line_idx in scored[:top_k]:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        start = max(line_idx - context_lines, 0)
        end = min(line_idx + context_lines + 1, len(lines))
        hits.append(
            RagHit(
                path=path.relative_to(root).as_posix(),
                snippet="\n".join(lines[start:end]),
                score=round(score / max_score, 4),
                start_line=start + 1,
                source="fts",
                project=project,
            )
        )
    return hits
