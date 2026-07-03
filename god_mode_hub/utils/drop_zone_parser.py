"""Parser della Drop Zone: da risposta Claude/Gemini (Markdown) a file su disco.

Il flusso "orchestratore manuale" funziona così: l'Hub genera un mega-prompt,
tu lo incolli nella chat web di Claude/Gemini (abbonamento Pro, niente API),
poi incolli la risposta nella Drop Zone. Questo modulo:

1. estrae i code block recintati (via ``mdextractor`` se installato, con un
   parser regex interno come sorgente dei metadati lingua/percorso);
2. deduce per ogni blocco il *percorso file suggerito* da: info-string della
   fence (```dart path=lib/x.dart oppure ```dart:lib/x.dart), prima riga di
   commento (``// lib/x.dart``, ``# utils/x.py``, ``<!-- wiki/concepts/x.md -->``)
   o righe di testo immediatamente sopra la fence;
3. salva i blocchi codice (.dart/.py) in ``codebase/`` e le pagine Markdown
   in ``wiki/``, con sanificazione anti path-traversal.
"""

from __future__ import annotations

import datetime as _dt
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from utils import CODEBASE_DIR, VTT_PROJECT_DIR, WIKI_DIR, ensure_dirs

FENCE_RE = re.compile(
    r"^(?P<fence>```+|~~~+)[ \t]*(?P<info>[^\n]*?)[ \t]*\n"
    r"(?P<body>.*?)"
    r"^(?P=fence)[ \t]*$",
    re.DOTALL | re.MULTILINE,
)
COMMENT_PATH_RE = re.compile(
    r"^\s*(?://|#|<!--|/\*|;|--)\s*(?:file\s*:\s*)?"
    r"(?P<path>[\w./\\-]+\.(?:dart|py|md|yaml|yml|json|js|html|css))\s*(?:-->|\*/)?\s*$",
    re.IGNORECASE,
)
PATH_TOKEN_RE = re.compile(r"([\w./\\-]+\.(?:dart|py|md|yaml|yml|json|js|html|css))")

LANG_TO_EXT: dict[str, str] = {
    "dart": ".dart",
    "python": ".py",
    "py": ".py",
    "markdown": ".md",
    "md": ".md",
    "yaml": ".yaml",
    "yml": ".yaml",
    "json": ".json",
    "javascript": ".js",
    "js": ".js",
    "html": ".html",
    "css": ".css",
}
#: Codice per il futuro riscritto Flutter -> salvato in codebase/.
FLUTTER_CODE_EXTS = {".dart", ".py", ".yaml", ".json"}
#: Codice del progetto VTT attuale -> salvato direttamente nella radice del
#: repo (index.html, css/, js/), cioè nel progetto reale, non in una copia.
VTT_CODE_EXTS = {".js", ".html", ".css"}
CODE_EXTS = FLUTTER_CODE_EXTS | VTT_CODE_EXTS
WIKI_EXTS = {".md"}


@dataclass
class ParsedBlock:
    """Un blocco estratto dalla Drop Zone, pronto per il salvataggio."""

    language: str
    content: str
    suggested_path: str  # relativo a codebase/ o wiki/ (può essere vuoto -> autogenerato)
    kind: str  # "code" | "wiki" | "other"

    @property
    def line_count(self) -> int:
        return self.content.count("\n") + 1


@dataclass(frozen=True)
class SavedFile:
    """Esito del salvataggio di un blocco."""

    path: Path
    kind: str
    action: str  # "creato" | "sovrascritto"
    bytes_written: int


def _mdextractor_blocks(text: str) -> list[str] | None:
    """Estrae i blocchi con mdextractor, se installato (None se assente/errore).

    mdextractor restituisce solo i corpi dei blocchi (senza lingua): viene
    usato come verifica incrociata del parser regex interno, che invece
    fornisce anche info-string e contesto per dedurre i percorsi.
    """
    try:
        from mdextractor import extract_md_blocks
    except ImportError:
        return None
    try:
        return list(extract_md_blocks(text))
    except Exception:
        return None


def _parse_info_string(info: str) -> tuple[str, str]:
    """Da info-string della fence a ``(lingua, percorso_suggerito)``.

    Gestisce: ``dart``, ``dart path=lib/x.dart``, ``dart title="lib/x.dart"``,
    ``dart:lib/x.dart``.
    """
    info = info.strip()
    if not info:
        return "", ""
    lang, _, rest = info.partition(" ")
    path = ""
    if ":" in lang:  # forma dart:lib/x.dart
        lang, _, path = lang.partition(":")
    for key in ("path=", "title=", "file="):
        idx = rest.find(key)
        if idx >= 0:
            value = rest[idx + len(key) :].split()[0]
            path = value.strip("\"'")
            break
    if not path:
        match = PATH_TOKEN_RE.search(rest)
        if match:
            path = match.group(1)
    return lang.lower(), path


def _path_from_first_line(body: str) -> str:
    """Percorso dichiarato nella prima riga di commento del blocco, se c'è."""
    first_line = body.split("\n", 1)[0]
    match = COMMENT_PATH_RE.match(first_line)
    return match.group("path") if match else ""


def _path_from_context(text: str, fence_start: int) -> str:
    """Cerca un percorso nelle (max) 3 righe non vuote sopra la fence."""
    before = text[:fence_start].splitlines()
    checked = 0
    for line in reversed(before):
        stripped = line.strip()
        if not stripped:
            continue
        checked += 1
        match = PATH_TOKEN_RE.search(stripped)
        if match:
            return match.group(1)
        if checked >= 3:
            break
    return ""


def _classify(language: str, suggested_path: str) -> str:
    """Determina se un blocco è codice, pagina wiki o altro."""
    ext = PurePosixPath(suggested_path).suffix.lower() if suggested_path else ""
    if ext in WIKI_EXTS or language in ("markdown", "md"):
        return "wiki"
    if ext in CODE_EXTS or language in (
        "dart", "python", "py", "yaml", "yml", "json", "javascript", "js", "html", "css",
    ):
        return "code"
    return "other"


def extract_blocks(markdown_text: str) -> list[ParsedBlock]:
    """Estrae tutti i blocchi recintati con lingua e percorso suggerito.

    Se il parser regex non trova nulla ma ``mdextractor`` sì (fence esotiche),
    i blocchi di mdextractor vengono restituiti senza metadati di lingua.
    """
    blocks: list[ParsedBlock] = []
    for match in FENCE_RE.finditer(markdown_text):
        language, path = _parse_info_string(match.group("info"))
        body = match.group("body")
        if not path:
            path = _path_from_first_line(body)
        if not path:
            path = _path_from_context(markdown_text, match.start())
        path = path.replace("\\", "/").lstrip("./")
        blocks.append(
            ParsedBlock(
                language=language,
                content=body.rstrip("\n") + "\n",
                suggested_path=path,
                kind=_classify(language, path),
            )
        )
    if not blocks:
        for body in _mdextractor_blocks(markdown_text) or []:
            blocks.append(
                ParsedBlock(language="", content=body.rstrip("\n") + "\n",
                            suggested_path="", kind=_classify("", ""))
            )
    return blocks


def _sanitize_rel_path(raw: str) -> PurePosixPath | None:
    """Normalizza un percorso relativo, rifiutando assoluti e ``..``."""
    if not raw:
        return None
    candidate = PurePosixPath(raw.replace("\\", "/"))
    if candidate.is_absolute():
        return None
    parts = [p for p in candidate.parts if p not in (".",)]
    if any(p == ".." for p in parts) or not parts:
        return None
    return PurePosixPath(*parts)


def _default_name(block: ParsedBlock, index: int) -> str:
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = LANG_TO_EXT.get(block.language, ".txt")
    return f"dropzone_{stamp}_{index:02d}{ext}"


def resolve_destination(
    block: ParsedBlock,
    index: int,
    codebase_dir: Path = CODEBASE_DIR,
    wiki_dir: Path = WIKI_DIR,
    vtt_project_dir: Path = VTT_PROJECT_DIR,
) -> Path | None:
    """Calcola il percorso assoluto di destinazione per un blocco.

    * blocchi ``wiki`` → sotto ``wiki/`` (default ``wiki/sources/``);
    * blocchi ``code`` con estensione ``.js``/``.html``/``.css`` → **nel
      progetto VTT reale** (radice del repo: ``index.html``, ``css/``,
      ``js/``), non in una copia — così le risposte di Claude/Gemini
      aggiornano direttamente il VTT. Le modifiche restano comunque
      revisionabili/annullabili con git prima di un commit;
    * blocchi ``code`` con estensione ``.dart``/``.py``/``.yaml``/``.json``
      → sotto ``codebase/`` (futuro riscritto Flutter);
    * blocchi ``other`` → None (non salvati).
    """
    if block.kind == "other":
        return None
    rel = _sanitize_rel_path(block.suggested_path)
    if block.kind == "wiki":
        if rel is None:
            rel = PurePosixPath("sources") / _default_name(block, index)
        elif rel.parts[0] == "wiki":
            rel = PurePosixPath(*rel.parts[1:]) if len(rel.parts) > 1 else None
            if rel is None:
                rel = PurePosixPath("sources") / _default_name(block, index)
        return wiki_dir / rel
    # kind == "code"
    if rel is None:
        rel = PurePosixPath(_default_name(block, index))
    ext = rel.suffix.lower()
    target_root = vtt_project_dir if ext in VTT_CODE_EXTS else codebase_dir
    prefix_name = "codebase" if target_root is codebase_dir else None
    if prefix_name and rel.parts[0] == prefix_name:
        rel = PurePosixPath(*rel.parts[1:]) if len(rel.parts) > 1 else PurePosixPath(
            _default_name(block, index)
        )
    return target_root / rel


def save_blocks(
    blocks: list[ParsedBlock],
    codebase_dir: Path = CODEBASE_DIR,
    wiki_dir: Path = WIKI_DIR,
    vtt_project_dir: Path = VTT_PROJECT_DIR,
) -> list[SavedFile]:
    """Salva su disco i blocchi ``code`` e ``wiki`` (gli ``other`` sono ignorati).

    I blocchi ``.js``/``.html``/``.css`` finiscono in ``vtt_project_dir``
    (il progetto VTT reale), gli altri blocchi codice in ``codebase_dir``.

    Returns:
        Un :class:`SavedFile` per ogni blocco effettivamente scritto.
    """
    ensure_dirs()
    saved: list[SavedFile] = []
    for index, block in enumerate(blocks):
        destination = resolve_destination(block, index, codebase_dir, wiki_dir, vtt_project_dir)
        if destination is None:
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        action = "sovrascritto" if destination.exists() else "creato"
        data = block.content.encode("utf-8")
        destination.write_bytes(data)
        saved.append(
            SavedFile(path=destination, kind=block.kind, action=action,
                      bytes_written=len(data))
        )
    return saved


def parse_and_save(
    markdown_text: str,
    codebase_dir: Path = CODEBASE_DIR,
    wiki_dir: Path = WIKI_DIR,
    vtt_project_dir: Path = VTT_PROJECT_DIR,
) -> tuple[list[ParsedBlock], list[SavedFile]]:
    """Convenienza: estrae e salva in un colpo solo.

    Returns:
        ``(blocchi_estratti, file_salvati)``.
    """
    blocks = extract_blocks(markdown_text)
    return blocks, save_blocks(blocks, codebase_dir, wiki_dir, vtt_project_dir)
