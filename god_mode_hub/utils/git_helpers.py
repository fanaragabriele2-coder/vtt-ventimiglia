"""Integrazione git di sola lettura (più commit esplicito) sul progetto VTT.

Chiude il ciclo di lavoro dell'Orchestratore: genera → salva → **verifica** →
committa. Senza questo, dopo che la Drop Zone ha scritto file nel progetto
reale bisogna uscire dall'Hub e aprire un terminale per capire cosa è
cambiato davvero.

Tutte le funzioni sono difensive: se ``git`` non è installato, la cartella non
è un repository o il comando fallisce, restituiscono un risultato "vuoto"
invece di sollevare — l'Hub deve restare usabile comunque.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from utils import VTT_PROJECT_DIR

#: Timeout generoso: su repo grandi il primo `git status` può essere lento.
DEFAULT_TIMEOUT = 30.0


class GitError(RuntimeError):
    """Errore nell'esecuzione di un comando git."""


@dataclass(frozen=True)
class FileChange:
    """Un file modificato secondo ``git status --porcelain``."""

    path: str
    index_status: str  # stato nell'area di staging (' ', 'M', 'A', 'D'…)
    work_status: str   # stato nel working tree
    #: True se il file è nuovo e non ancora tracciato da git.
    untracked: bool = False

    @property
    def descrizione(self) -> str:
        """Etichetta leggibile dello stato del file."""
        if self.untracked:
            return "nuovo (non tracciato)"
        mappa = {"M": "modificato", "A": "aggiunto", "D": "eliminato",
                 "R": "rinominato", "C": "copiato", "U": "in conflitto"}
        stati = []
        if self.index_status.strip():
            stati.append(f"staged: {mappa.get(self.index_status, self.index_status)}")
        if self.work_status.strip():
            stati.append(mappa.get(self.work_status, self.work_status))
        return " · ".join(stati) or "invariato"


@dataclass
class RepoStatus:
    """Fotografia dello stato del repository."""

    is_repo: bool = False
    branch: str = ""
    changes: list[FileChange] = field(default_factory=list)
    error: str = ""

    @property
    def has_changes(self) -> bool:
        return bool(self.changes)


def _run_git(
    args: list[str],
    repo: Path = VTT_PROJECT_DIR,
    timeout: float = DEFAULT_TIMEOUT,
) -> tuple[int, str, str]:
    """Esegue un comando git restituendo ``(returncode, stdout, stderr)``.

    Non solleva mai per un comando fallito: il codice di uscita è parte del
    risultato. Solleva :class:`GitError` solo se git non è proprio lanciabile.
    """
    try:
        completed = subprocess.run(
            ["git", *args], cwd=str(repo), capture_output=True, text=True,
            timeout=timeout, check=False,
        )
    except FileNotFoundError as exc:
        raise GitError("git non è installato o non è nel PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise GitError(f"git non ha risposto entro {timeout:.0f}s.") from exc
    except OSError as exc:
        raise GitError(f"Impossibile eseguire git: {exc}") from exc
    return completed.returncode, completed.stdout, completed.stderr


def is_git_repo(repo: Path = VTT_PROJECT_DIR) -> bool:
    """True se ``repo`` è (dentro) un repository git utilizzabile."""
    try:
        code, out, _ = _run_git(["rev-parse", "--is-inside-work-tree"], repo)
    except GitError:
        return False
    return code == 0 and out.strip() == "true"


def current_branch(repo: Path = VTT_PROJECT_DIR) -> str:
    """Nome del branch corrente (stringa vuota se non determinabile)."""
    try:
        code, out, _ = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], repo)
    except GitError:
        return ""
    return out.strip() if code == 0 else ""


def status(repo: Path = VTT_PROJECT_DIR) -> RepoStatus:
    """Stato del repository: branch e file modificati.

    Returns:
        :class:`RepoStatus`; con ``is_repo=False`` e ``error`` valorizzato se
        git manca o la cartella non è un repository.
    """
    try:
        if not is_git_repo(repo):
            return RepoStatus(is_repo=False, error=f"{repo} non è un repository git.")
        code, out, err = _run_git(["status", "--porcelain=v1"], repo)
    except GitError as exc:
        return RepoStatus(is_repo=False, error=str(exc))
    if code != 0:
        return RepoStatus(is_repo=True, branch=current_branch(repo), error=err.strip())

    changes: list[FileChange] = []
    for line in out.splitlines():
        if len(line) < 4:
            continue
        index_status, work_status, path = line[0], line[1], line[3:].strip()
        # I rinominati hanno forma "vecchio -> nuovo": teniamo la destinazione.
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        changes.append(
            FileChange(
                path=path.strip('"'),
                index_status=index_status,
                work_status=work_status,
                untracked=(index_status == "?" and work_status == "?"),
            )
        )
    return RepoStatus(is_repo=True, branch=current_branch(repo), changes=changes)


def diff(
    path: str | None = None,
    repo: Path = VTT_PROJECT_DIR,
    staged: bool = False,
    max_chars: int = 200_000,
) -> str:
    """Diff del working tree (o dell'area di staging).

    Args:
        path: limita il diff a un singolo file; ``None`` per tutto il repo.
        staged: se True mostra le modifiche già in staging (``--cached``).
        max_chars: tronca output enormi, che bloccherebbero l'interfaccia.
    """
    args = ["diff"]
    if staged:
        args.append("--cached")
    if path:
        args += ["--", path]
    try:
        code, out, err = _run_git(args, repo)
    except GitError as exc:
        return f"(diff non disponibile: {exc})"
    if code != 0:
        return f"(git diff fallito: {err.strip()})"
    if len(out) > max_chars:
        return out[:max_chars] + f"\n… (diff troncato a {max_chars:,} caratteri)"
    return out


def diff_untracked(path: str, repo: Path = VTT_PROJECT_DIR, max_chars: int = 50_000) -> str:
    """Contenuto di un file nuovo, presentato come diff di sole aggiunte.

    ``git diff`` ignora i file non tracciati: senza questo, un file appena
    creato dalla Drop Zone risulterebbe invisibile nell'anteprima.
    """
    target = repo / path
    try:
        testo = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return f"(impossibile leggere {path}: {exc})"
    righe = testo.splitlines()
    intestazione = f"--- /dev/null\n+++ b/{path}\n@@ file nuovo, {len(righe)} righe @@\n"
    corpo = "\n".join(f"+{riga}" for riga in righe)
    risultato = intestazione + corpo
    if len(risultato) > max_chars:
        return risultato[:max_chars] + f"\n… (troncato a {max_chars:,} caratteri)"
    return risultato


def commit(
    message: str,
    paths: list[str] | None = None,
    repo: Path = VTT_PROJECT_DIR,
) -> tuple[bool, str]:
    """Mette in staging e committa i percorsi indicati (o tutte le modifiche).

    Args:
        message: messaggio di commit (obbligatorio, non vuoto).
        paths: file da includere; ``None`` = tutte le modifiche presenti.

    Returns:
        ``(riuscito, messaggio_per_l_utente)``.
    """
    message = message.strip()
    if not message:
        return False, "Il messaggio di commit non può essere vuoto."
    try:
        if paths:
            code, _, err = _run_git(["add", "--", *paths], repo)
        else:
            code, _, err = _run_git(["add", "-A"], repo)
        if code != 0:
            return False, f"git add fallito: {err.strip()}"
        code, out, err = _run_git(["commit", "-m", message], repo)
    except GitError as exc:
        return False, str(exc)
    if code != 0:
        dettaglio = (err.strip() or out.strip())
        if "nothing to commit" in dettaglio.lower():
            return False, "Niente da committare: nessuna modifica in staging."
        return False, f"git commit fallito: {dettaglio}"
    return True, out.strip().splitlines()[0] if out.strip() else "Commit creato."


def last_commits(count: int = 5, repo: Path = VTT_PROJECT_DIR) -> list[str]:
    """Ultimi commit in formato breve (lista vuota in caso di errore)."""
    try:
        code, out, _ = _run_git(["log", f"-{count}", "--oneline", "--no-decorate"], repo)
    except GitError:
        return []
    return out.splitlines() if code == 0 else []
