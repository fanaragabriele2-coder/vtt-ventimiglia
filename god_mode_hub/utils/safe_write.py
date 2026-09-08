"""Scrittura sicura dei file: backup, diff e percorsi protetti.

La Drop Zone salva codice generato da un LLM **sopra i file reali del
progetto VTT**. È il punto più pericoloso dell'Hub: una risposta troncata
(l'LLM che scrive ``// ...resto del codice invariato``) sostituisce un modulo
funzionante da 3 KB con uno stub da 50 byte, e senza git committato quel
lavoro è perso.

Questo modulo mette tre reti di sicurezza *prima* di ogni scrittura:

1. **Percorsi protetti** — rifiuta scritture in ``.git/``, ``node_modules/``,
   ``dist/``, ``.venv/``… (aree che l'LLM non deve mai toccare);
2. **Backup automatico** — copia il file esistente in
   ``.hub_backups/<timestamp>/`` prima di sovrascriverlo, con ripristino a un
   click;
3. **Analisi del diff** — conta righe aggiunte/rimosse e riconosce le
   *troncature* tipiche degli LLM (marcatori di ellissi, crollo di dimensione)
   per avvisare l'utente prima che accetti la sostituzione.
"""

from __future__ import annotations

import datetime as _dt
import difflib
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from utils import HUB_ROOT, VTT_PROJECT_DIR

#: Directory dei backup automatici (dentro l'Hub, esclusa da git).
BACKUP_DIR = HUB_ROOT / ".hub_backups"

#: Prefissi di percorso in cui la Drop Zone non deve MAI scrivere: aree di
#: sistema (git), dipendenze installate, build generate, ambienti virtuali.
PROTECTED_PREFIXES: frozenset[str] = frozenset({
    ".git", ".github", "node_modules", ".venv", "venv", "dist",
    "chroma_index", "__pycache__", ".hub_backups", ".streamlit",
})

#: Marcatori di elisione che gli LLM inseriscono al posto del codice omesso.
#: La loro presenza in un file "completo" indica quasi sempre una troncatura.
_ELLIPSIS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^\s*(?://|#|/\*|<!--)?\s*\.\.\.\s*(?:\*/|-->)?\s*$", re.MULTILINE),
    re.compile(r"(?i)(?://|#|/\*|<!--)\s*\.{0,3}\s*(resto|rimanente|remainder|rest)\s+(del|of|dei|della)"),
    re.compile(r"(?i)(?://|#|/\*|<!--)\s*.*(codice\s+(invariato|omesso|precedente)|"
               r"code\s+(unchanged|omitted|remains|continues)|"
               r"invariato|unchanged|come\s+prima|as\s+before|resto\s+uguale)"),
    re.compile(r"(?i)(?://|#|/\*|<!--)\s*\[?\s*(truncated|troncato|snip)\s*\]?"),
)

#: Sotto questa frazione della dimensione originale, una sovrascrittura è
#: sospetta (l'LLM ha probabilmente restituito solo un frammento).
SHRINK_RATIO_THRESHOLD = 0.5
#: File più piccoli di così sono troppo corti perché il rapporto sia indicativo.
MIN_SIZE_FOR_SHRINK_CHECK = 200


class ProtectedPathError(RuntimeError):
    """Tentativo di scrittura in un percorso protetto."""


@dataclass(frozen=True)
class DiffSummary:
    """Confronto tra il contenuto attuale di un file e quello nuovo."""

    exists: bool
    old_bytes: int
    new_bytes: int
    added_lines: int
    removed_lines: int
    ellipsis_markers: list[str] = field(default_factory=list)
    unified_diff: str = ""

    @property
    def shrink_ratio(self) -> float:
        """Frazione di dimensione conservata (1.0 = identica, 0.1 = crollata)."""
        if not self.exists or self.old_bytes == 0:
            return 1.0
        return self.new_bytes / self.old_bytes

    @property
    def looks_truncated(self) -> bool:
        """True se il nuovo contenuto sembra una versione troncata dall'LLM.

        Due segnali indipendenti: marcatori di elisione espliciti, oppure un
        crollo di dimensione su un file che era abbastanza grande da rendere
        il rapporto significativo.
        """
        if self.ellipsis_markers:
            return True
        return (
            self.exists
            and self.old_bytes >= MIN_SIZE_FOR_SHRINK_CHECK
            and self.shrink_ratio < SHRINK_RATIO_THRESHOLD
        )

    @property
    def is_identical(self) -> bool:
        """True se il nuovo contenuto non cambia nulla."""
        return self.exists and self.added_lines == 0 and self.removed_lines == 0


@dataclass(frozen=True)
class WriteResult:
    """Esito di una scrittura sicura."""

    path: Path
    action: str  # "creato" | "sovrascritto" | "invariato"
    bytes_written: int
    backup_path: Path | None = None


def find_ellipsis_markers(content: str) -> list[str]:
    """Righe che sembrano marcatori di codice omesso da un LLM."""
    markers: list[str] = []
    for pattern in _ELLIPSIS_PATTERNS:
        for match in pattern.finditer(content):
            line = match.group(0).strip()
            if line and line not in markers:
                markers.append(line)
    return markers


def is_protected(path: Path, project_root: Path = VTT_PROJECT_DIR) -> bool:
    """True se ``path`` cade in un'area che non va mai sovrascritta."""
    try:
        rel = path.resolve().relative_to(project_root.resolve())
    except ValueError:
        return True  # fuori dal progetto: sempre protetto
    return any(part in PROTECTED_PREFIXES for part in rel.parts)


def diff_against_existing(path: Path, new_content: str, context: int = 3) -> DiffSummary:
    """Confronta il contenuto proposto con il file già presente su disco.

    Non scrive nulla: serve a mostrare all'utente cosa cambierebbe *prima* di
    accettare la sovrascrittura.
    """
    markers = find_ellipsis_markers(new_content)
    new_bytes = len(new_content.encode("utf-8"))
    if not path.exists():
        return DiffSummary(
            exists=False, old_bytes=0, new_bytes=new_bytes,
            added_lines=new_content.count("\n"), removed_lines=0,
            ellipsis_markers=markers,
        )

    old_content = path.read_text(encoding="utf-8", errors="replace")
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    diff_lines = list(
        difflib.unified_diff(
            old_lines, new_lines,
            fromfile=f"{path.name} (attuale)", tofile=f"{path.name} (nuovo)",
            n=context,
        )
    )
    added = sum(1 for l in diff_lines if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff_lines if l.startswith("-") and not l.startswith("---"))
    return DiffSummary(
        exists=True,
        old_bytes=len(old_content.encode("utf-8")),
        new_bytes=new_bytes,
        added_lines=added,
        removed_lines=removed,
        ellipsis_markers=markers,
        unified_diff="".join(diff_lines),
    )


def backup_file(
    path: Path,
    project_root: Path = VTT_PROJECT_DIR,
    backup_root: Path = BACKUP_DIR,
    stamp: str | None = None,
) -> Path | None:
    """Copia il file in ``.hub_backups/<timestamp>/`` conservando la struttura.

    Returns:
        Percorso del backup, o ``None`` se il file non esisteva (niente da
        salvare).
    """
    if not path.exists():
        return None
    stamp = stamp or _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    try:
        rel = path.resolve().relative_to(project_root.resolve())
    except ValueError:
        rel = Path(path.name)
    destination = backup_root / stamp / rel
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)
    return destination


def safe_write(
    path: Path,
    content: str,
    make_backup: bool = True,
    project_root: Path = VTT_PROJECT_DIR,
    backup_root: Path = BACKUP_DIR,
    stamp: str | None = None,
) -> WriteResult:
    """Scrive un file facendo prima il backup di quello esistente.

    Raises:
        ProtectedPathError: se il percorso ricade in :data:`PROTECTED_PREFIXES`
            o fuori dalla radice del progetto.
    """
    if is_protected(path, project_root):
        raise ProtectedPathError(
            f"Scrittura rifiutata in area protetta: {path}. "
            "L'Hub non scrive mai in .git/, node_modules/, dist/, .venv/."
        )

    existed = path.exists()
    if existed and path.read_text(encoding="utf-8", errors="replace") == content:
        return WriteResult(path=path, action="invariato", bytes_written=0)

    backup = backup_file(path, project_root, backup_root, stamp) if (existed and make_backup) else None
    path.parent.mkdir(parents=True, exist_ok=True)
    data = content.encode("utf-8")
    path.write_bytes(data)
    return WriteResult(
        path=path,
        action="sovrascritto" if existed else "creato",
        bytes_written=len(data),
        backup_path=backup,
    )


def list_backup_sessions(backup_root: Path = BACKUP_DIR) -> list[tuple[str, int]]:
    """Sessioni di backup disponibili, dalla più recente.

    Returns:
        Lista di ``(timestamp, numero_file)``.
    """
    if not backup_root.exists():
        return []
    sessions: list[tuple[str, int]] = []
    for entry in sorted(backup_root.iterdir(), reverse=True):
        if entry.is_dir():
            sessions.append((entry.name, sum(1 for p in entry.rglob("*") if p.is_file())))
    return sessions


def restore_backup_session(
    stamp: str,
    project_root: Path = VTT_PROJECT_DIR,
    backup_root: Path = BACKUP_DIR,
) -> list[Path]:
    """Ripristina tutti i file di una sessione di backup nelle posizioni originali.

    Returns:
        Percorsi dei file ripristinati.

    Raises:
        FileNotFoundError: se la sessione di backup non esiste.
    """
    session_dir = backup_root / stamp
    if not session_dir.is_dir():
        raise FileNotFoundError(f"Sessione di backup inesistente: {stamp}")
    restored: list[Path] = []
    for backup_path in sorted(session_dir.rglob("*")):
        if not backup_path.is_file():
            continue
        rel = backup_path.relative_to(session_dir)
        target = project_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_path, target)
        restored.append(target)
    return restored


def prune_backups(keep: int = 20, backup_root: Path = BACKUP_DIR) -> int:
    """Elimina le sessioni di backup più vecchie, tenendo le ``keep`` recenti.

    Returns:
        Numero di sessioni eliminate.
    """
    sessions = [s for s, _ in list_backup_sessions(backup_root)]
    removed = 0
    for stamp in sessions[keep:]:
        shutil.rmtree(backup_root / stamp, ignore_errors=True)
        removed += 1
    return removed
