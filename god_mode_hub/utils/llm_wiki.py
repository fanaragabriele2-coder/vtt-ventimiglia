"""LLM Wiki (pattern Karpathy) con retrieval FTS5 su SQLite.

Il pattern: le fonti grezze (note, trascrizioni, appunti) vivono in ``raw/``;
le pagine curate e collegate tra loro con link ``[[wiki]]`` vivono in
``wiki/`` (``sources/``, ``concepts/``, ``entities/`` + ``index.md`` e
``log.md``). Il retrieval NON usa embeddings: un indice FTS5 di SQLite
(bm25) fuso via Reciprocal Rank Fusion con un ranking a sovrapposizione di
keyword copre il caso d'uso "appunti personali" a costo zero di VRAM.
"""

from __future__ import annotations

import datetime as _dt
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Sequence

from utils import RAW_DIR, WIKI_DIR, ensure_dirs, slugify

DB_NAME = "wiki_fts.db"
TEXT_EXTENSIONS: tuple[str, ...] = (".md", ".txt")
BINARY_EXTENSIONS: tuple[str, ...] = (".pdf", ".png", ".jpg", ".jpeg", ".webp")
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
MDLINK_RE = re.compile(r"\[[^\]]*\]\(([^)#\s]+\.md)\)")
RRF_K = 60


@dataclass(frozen=True)
class WikiHit:
    """Risultato di una ricerca nella wiki."""

    path: str
    title: str
    snippet: str
    score: float
    kind: str  # "wiki" oppure "raw"


@dataclass
class LintReport:
    """Esito del linting della wiki."""

    orphan_links: list[tuple[str, str]] = field(default_factory=list)  # (pagina, link)
    contradictions: list[tuple[str, str, str, str]] = field(default_factory=list)
    # contradictions: (pagina_a, riga_a, pagina_b, riga_b)
    pages_scanned: int = 0


# --------------------------------------------------------------------------
# Scheletro e file system
# --------------------------------------------------------------------------

def ensure_wiki_skeleton(wiki_dir: Path = WIKI_DIR) -> None:
    """Crea ``index.md`` e ``log.md`` (e le sottocartelle) se mancano."""
    ensure_dirs()
    for sub in ("sources", "concepts", "entities"):
        (wiki_dir / sub).mkdir(parents=True, exist_ok=True)
    index = wiki_dir / "index.md"
    if not index.exists():
        index.write_text(
            "# 🧠 LLM Wiki — Indice\n\n## Fonti\n\n", encoding="utf-8"
        )
    log = wiki_dir / "log.md"
    if not log.exists():
        log.write_text("# 📜 Log della wiki\n", encoding="utf-8")


def list_raw_files(raw_dir: Path = RAW_DIR) -> list[Path]:
    """Elenca le fonti grezze presenti in ``raw/`` (testo e binari noti)."""
    if not raw_dir.exists():
        return []
    allowed = TEXT_EXTENSIONS + BINARY_EXTENSIONS
    return sorted(
        p for p in raw_dir.rglob("*") if p.is_file() and p.suffix.lower() in allowed
    )


def _iter_indexable_docs(
    wiki_dir: Path, raw_dir: Path
) -> Iterator[tuple[str, str, str, str]]:
    """Genera tuple ``(path_relativa, kind, titolo, contenuto)`` da indicizzare."""
    for base, kind in ((wiki_dir, "wiki"), (raw_dir, "raw")):
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.md")) + sorted(base.rglob("*.txt")):
            if path.name == DB_NAME or not path.is_file():
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            title = _extract_title(content) or path.stem.replace("_", " ")
            rel = f"{base.name}/{path.relative_to(base).as_posix()}"
            yield rel, kind, title, content


def _extract_title(content: str) -> str | None:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return None


# --------------------------------------------------------------------------
# Indice FTS5
# --------------------------------------------------------------------------

def _db_path(wiki_dir: Path = WIKI_DIR) -> Path:
    return wiki_dir / DB_NAME


def _connect(wiki_dir: Path = WIKI_DIR) -> sqlite3.Connection:
    """Apre (creando lo schema se serve) il database FTS5 della wiki.

    Raises:
        RuntimeError: se la build di SQLite non include il modulo FTS5.
    """
    ensure_wiki_skeleton(wiki_dir)
    conn = sqlite3.connect(_db_path(wiki_dir))
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5("
            "path UNINDEXED, kind UNINDEXED, title, content)"
        )
    except sqlite3.OperationalError as exc:  # FTS5 assente
        conn.close()
        raise RuntimeError(
            "La build di SQLite in uso non supporta FTS5: aggiorna Python."
        ) from exc
    return conn


def rebuild_index(wiki_dir: Path = WIKI_DIR, raw_dir: Path = RAW_DIR) -> int:
    """Ricostruisce da zero l'indice FTS5 su ``wiki/`` + ``raw/``.

    Returns:
        Numero di documenti indicizzati.
    """
    with _connect(wiki_dir) as conn:
        conn.execute("DELETE FROM wiki_fts")
        count = 0
        for rel, kind, title, content in _iter_indexable_docs(wiki_dir, raw_dir):
            conn.execute(
                "INSERT INTO wiki_fts (path, kind, title, content) VALUES (?,?,?,?)",
                (rel, kind, title, content),
            )
            count += 1
    return count


def index_size(wiki_dir: Path = WIKI_DIR) -> int:
    """Documenti presenti nell'indice (0 se il DB non esiste ancora)."""
    if not _db_path(wiki_dir).exists():
        return 0
    try:
        with _connect(wiki_dir) as conn:
            row = conn.execute("SELECT count(*) FROM wiki_fts").fetchone()
            return int(row[0]) if row else 0
    except (sqlite3.Error, RuntimeError):
        return 0


def _fts_match_expr(query: str) -> str:
    """Costruisce un'espressione MATCH sicura (token quotati, OR)."""
    tokens = re.findall(r"\w+", query)
    return " OR ".join(f'"{tok}"' for tok in tokens)


def _rrf(rankings: Sequence[Sequence[str]], k: int = RRF_K) -> dict[str, float]:
    """Reciprocal Rank Fusion: fonde più ranking di path in un punteggio."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, key in enumerate(ranking):
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
    return scores


def search(
    query: str,
    top_k: int = 10,
    wiki_dir: Path = WIKI_DIR,
) -> list[WikiHit]:
    """Cerca nella wiki: FTS5 (bm25) + keyword overlap, fusi con RRF.

    Returns:
        Fino a ``top_k`` risultati ordinati per punteggio RRF decrescente.
        Lista vuota se la query è vuota o l'indice non è mai stato costruito.
    """
    query = query.strip()
    if not query or index_size(wiki_dir) == 0:
        return []
    match_expr = _fts_match_expr(query)
    if not match_expr:
        return []

    with _connect(wiki_dir) as conn:
        # Ranking A: bm25 nativo di FTS5, con snippet evidenziato.
        fts_rows = conn.execute(
            "SELECT path, kind, title, "
            "snippet(wiki_fts, 3, '**', '**', ' … ', 14) "
            "FROM wiki_fts WHERE wiki_fts MATCH ? ORDER BY bm25(wiki_fts) LIMIT 30",
            (match_expr,),
        ).fetchall()
        # Ranking B: sovrapposizione di keyword sull'intero corpus.
        all_rows = conn.execute(
            "SELECT path, kind, title, content FROM wiki_fts"
        ).fetchall()

    tokens = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 1]
    keyword_scored: list[tuple[float, tuple[str, str, str, str]]] = []
    for path, kind, title, content in all_rows:
        lower = content.lower()
        score = float(sum(lower.count(tok) for tok in tokens))
        if score > 0:
            keyword_scored.append((score, (path, kind, title, content)))
    keyword_scored.sort(key=lambda item: item[0], reverse=True)

    ranking_fts = [row[0] for row in fts_rows]
    ranking_kw = [row[1][0] for row in keyword_scored[:30]]
    fused = _rrf([ranking_fts, ranking_kw])

    info: dict[str, tuple[str, str, str]] = {}  # path -> (kind, title, snippet)
    for path, kind, title, snippet in fts_rows:
        info[path] = (kind, title, snippet)
    for _score, (path, kind, title, content) in keyword_scored:
        if path not in info:
            info[path] = (kind, title, _manual_snippet(content, tokens))

    ordered = sorted(fused.items(), key=lambda item: item[1], reverse=True)
    hits: list[WikiHit] = []
    for path, score in ordered[:top_k]:
        kind, title, snippet = info.get(path, ("wiki", path, ""))
        hits.append(
            WikiHit(path=path, title=title, snippet=snippet, score=round(score, 4), kind=kind)
        )
    return hits


def _manual_snippet(content: str, tokens: Sequence[str], radius: int = 120) -> str:
    """Snippet centrato sulla prima occorrenza di un token della query."""
    lower = content.lower()
    for tok in tokens:
        pos = lower.find(tok)
        if pos >= 0:
            start = max(pos - radius, 0)
            end = min(pos + radius, len(content))
            return ("…" if start > 0 else "") + content[start:end].strip() + "…"
    return content[: radius * 2].strip()


# --------------------------------------------------------------------------
# Compilazione fonti raw/ -> wiki/
# --------------------------------------------------------------------------

def extract_pdf_text(pdf_path: Path, max_pages: int = 30) -> str | None:
    """Estrae il testo di un PDF con ``pypdf``, se installato.

    Returns:
        Il testo estratto, oppure ``None`` se ``pypdf`` non è disponibile o il
        PDF non contiene testo selezionabile (es. scansione di immagini: lì
        servirebbe un OCR, fuori portata per l'Hub).
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    try:
        reader = PdfReader(str(pdf_path))
        parti = [(page.extract_text() or "") for page in reader.pages[:max_pages]]
    except Exception:  # noqa: BLE001 — PDF corrotto/protetto: nessun testo
        return None
    testo = "\n\n".join(parte.strip() for parte in parti if parte.strip())
    return testo or None


def compile_raw_source(
    raw_path: Path,
    wiki_dir: Path = WIKI_DIR,
    excerpt_chars: int = 1800,
) -> Path:
    """Compila una fonte grezza in una pagina ``wiki/sources/<slug>.md``.

    Per i file di testo include un estratto; per i binari (PDF, screenshot)
    crea una pagina stub con il riferimento al file. La sintesi vera e propria
    resta un lavoro da LLM: la pagina contiene un TODO da completare via
    Orchestratore (mega-prompt + Drop Zone).

    Returns:
        Percorso della pagina wiki creata (o già esistente e aggiornata).
    """
    ensure_wiki_skeleton(wiki_dir)
    raw_path = raw_path.resolve()
    slug = slugify(raw_path.stem)
    page_path = wiki_dir / "sources" / f"{slug}.md"
    now = _dt.datetime.now().isoformat(timespec="seconds")

    if raw_path.suffix.lower() in TEXT_EXTENSIONS:
        text = raw_path.read_text(encoding="utf-8", errors="replace")
        title = _extract_title(text) or raw_path.stem.replace("_", " ").title()
        excerpt = text.strip()[:excerpt_chars]
        body_section = f"## Estratto\n\n{excerpt}\n"
    elif raw_path.suffix.lower() == ".pdf":
        title = raw_path.stem.replace("_", " ").title()
        pdf_text = extract_pdf_text(raw_path)
        if pdf_text:
            body_section = f"## Estratto\n\n{pdf_text.strip()[:excerpt_chars]}\n"
        else:
            body_section = (
                "## Estratto\n\n"
                "PDF senza testo estraibile (scansione di immagini) oppure "
                "`pypdf` non installato (`pip install pypdf`). Aprire il file "
                "originale per il contenuto.\n"
            )
    else:
        title = raw_path.stem.replace("_", " ").title()
        body_section = (
            "## Estratto\n\n"
            f"Fonte binaria (`{raw_path.suffix}`): aprire il file originale per il contenuto.\n"
        )

    page = (
        "---\n"
        f"source: raw/{raw_path.name}\n"
        f"compiled: {now}\n"
        "type: source\n"
        "---\n\n"
        f"# {title}\n\n"
        f"{body_section}\n"
        "## Note\n\n"
        "- TODO: sintetizzare i punti chiave (usa l'Orchestratore: mega-prompt → "
        "Claude/Gemini web → Drop Zone).\n\n"
        "## Collegamenti\n\n"
        "- [[index]]\n"
    )
    page_path.write_text(page, encoding="utf-8")
    append_log(f"Compilata fonte `raw/{raw_path.name}` → `sources/{slug}.md`", wiki_dir)
    _register_in_index(f"sources/{slug}.md", title, wiki_dir)
    return page_path


def append_log(message: str, wiki_dir: Path = WIKI_DIR) -> None:
    """Aggiunge una riga datata a ``wiki/log.md``."""
    ensure_wiki_skeleton(wiki_dir)
    stamp = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    log = wiki_dir / "log.md"
    with log.open("a", encoding="utf-8") as handle:
        handle.write(f"\n- **{stamp}** — {message}")


def _register_in_index(rel_page: str, title: str, wiki_dir: Path) -> None:
    """Aggiunge la pagina alla sezione ``## Fonti`` di ``index.md`` se manca."""
    index = wiki_dir / "index.md"
    content = index.read_text(encoding="utf-8")
    entry = f"- [{title}]({rel_page})"
    if rel_page in content:
        return
    if "## Fonti" in content:
        content = content.replace("## Fonti", f"## Fonti\n\n{entry}", 1)
    else:
        content += f"\n## Fonti\n\n{entry}\n"
    index.write_text(content, encoding="utf-8")


# --------------------------------------------------------------------------
# Linting: link orfani + contraddizioni (euristica)
# --------------------------------------------------------------------------

_NEGATIONS = {"non", "not", "mai", "never", "no", "senza"}


def lint_wiki(wiki_dir: Path = WIKI_DIR, max_fact_lines: int = 2000) -> LintReport:
    """Esegue il linting della wiki.

    * **Link orfani**: link ``[[Pagina]]`` o ``[testo](pagina.md)`` che non
      corrispondono a nessun file esistente sotto ``wiki/``.
    * **Contraddizioni** (euristica): coppie di righe-fatto (bullet) molto
      simili in cui una sola delle due contiene una negazione — candidate da
      rivedere a mano, non verdetti.
    """
    ensure_wiki_skeleton(wiki_dir)
    report = LintReport()

    pages = [p for p in wiki_dir.rglob("*.md") if p.is_file()]
    known_stems = {p.stem.lower() for p in pages}
    known_stems |= {slugify(p.stem) for p in pages}
    known_rel = {p.relative_to(wiki_dir).as_posix().lower() for p in pages}

    fact_lines: list[tuple[str, str, frozenset[str], bool]] = []
    # (pagina, riga, token_non_negazione, contiene_negazione)

    for page in pages:
        report.pages_scanned += 1
        rel = page.relative_to(wiki_dir).as_posix()
        content = page.read_text(encoding="utf-8", errors="replace")

        for match in WIKILINK_RE.finditer(content):
            target = match.group(1).strip()
            candidates = {target.lower(), slugify(target)}
            if not candidates & known_stems:
                report.orphan_links.append((rel, f"[[{target}]]"))
        for match in MDLINK_RE.finditer(content):
            target = match.group(1).strip().lstrip("./")
            if target.lower() not in known_rel:
                resolved = (page.parent / target).resolve()
                if not resolved.exists():
                    report.orphan_links.append((rel, target))

        if len(fact_lines) < max_fact_lines:
            for line in content.splitlines():
                stripped = line.strip()
                if not stripped.startswith(("-", "*")) or len(stripped) < 12:
                    continue
                tokens = {t for t in re.findall(r"\w+", stripped.lower()) if len(t) > 2}
                has_neg = bool(tokens & _NEGATIONS)
                fact_lines.append((rel, stripped, frozenset(tokens - _NEGATIONS), has_neg))

    for i, (page_a, line_a, tokens_a, neg_a) in enumerate(fact_lines):
        for page_b, line_b, tokens_b, neg_b in fact_lines[i + 1 :]:
            if neg_a == neg_b or not tokens_a or not tokens_b:
                continue
            union = tokens_a | tokens_b
            if not union:
                continue
            jaccard = len(tokens_a & tokens_b) / len(union)
            if jaccard >= 0.75:
                report.contradictions.append((page_a, line_a, page_b, line_b))
    return report
