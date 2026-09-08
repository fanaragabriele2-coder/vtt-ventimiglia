"""Test di LLM Wiki (FTS5 + RRF) e del RAG sulla codebase (fallback full-text)."""

from __future__ import annotations

from pathlib import Path

import pytest

from utils import chroma_rag, llm_wiki


# ---------------------------------------------------------------------------
# LLM Wiki
# ---------------------------------------------------------------------------

def test_scheletro_wiki_creato(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, _ = wiki_dirs
    llm_wiki.ensure_wiki_skeleton(wiki)
    assert (wiki / "index.md").exists()
    assert (wiki / "log.md").exists()
    assert (wiki / "concepts").is_dir()


def test_indice_e_ricerca(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, raw = wiki_dirs
    (wiki / "concepts" / "token.md").write_text(
        "# Token sulla griglia\n\nI token large occupano 2x2 caselle.\n", encoding="utf-8"
    )
    (wiki / "concepts" / "audio.md").write_text(
        "# Audio\n\nIl motore audio e' procedurale.\n", encoding="utf-8"
    )

    n = llm_wiki.rebuild_index(wiki, raw)
    # 2 pagine + index.md e log.md creati dallo scheletro
    assert n == 4
    assert llm_wiki.index_size(wiki) == 4

    risultati = llm_wiki.search("token griglia caselle", wiki_dir=wiki)
    assert risultati, "la ricerca deve trovare la pagina sui token"
    assert "token" in risultati[0].path.lower()


def test_ricerca_su_indice_vuoto_non_esplode(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, _ = wiki_dirs
    assert llm_wiki.search("qualsiasi cosa", wiki_dir=wiki) == []


def test_query_vuota_restituisce_lista_vuota(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, raw = wiki_dirs
    (wiki / "concepts" / "x.md").write_text("# X\n\ncontenuto\n", encoding="utf-8")
    llm_wiki.rebuild_index(wiki, raw)
    assert llm_wiki.search("   ", wiki_dir=wiki) == []


def test_compila_fonte_testuale(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, raw = wiki_dirs
    fonte = raw / "appunti_sessione.md"
    fonte.write_text("# Sessione 12\n\nIl party ha trovato la cripta.\n", encoding="utf-8")

    pagina = llm_wiki.compile_raw_source(fonte, wiki_dir=wiki)

    assert pagina.exists()
    testo = pagina.read_text(encoding="utf-8")
    assert "cripta" in testo
    assert "source: raw/appunti_sessione.md" in testo
    assert "[[index]]" in testo
    assert "appunti_sessione.md" in (wiki / "index.md").read_text(encoding="utf-8") or \
           "Sessione 12" in (wiki / "index.md").read_text(encoding="utf-8")


def test_lint_trova_link_orfani(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, _ = wiki_dirs
    (wiki / "concepts" / "a.md").write_text(
        "# A\n\nVedi [[pagina_inesistente]] e [[a]].\n", encoding="utf-8"
    )
    report = llm_wiki.lint_wiki(wiki_dir=wiki)
    orfani = [link for _, link in report.orphan_links]
    assert "[[pagina_inesistente]]" in orfani
    assert "[[a]]" not in orfani


def test_lint_rileva_contraddizione_con_negazione(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, _ = wiki_dirs
    (wiki / "concepts" / "regole.md").write_text(
        "# Regole\n\n- I token large occupano due caselle sulla griglia\n", encoding="utf-8"
    )
    (wiki / "concepts" / "regole2.md").write_text(
        "# Regole 2\n\n- I token large non occupano due caselle sulla griglia\n", encoding="utf-8"
    )
    report = llm_wiki.lint_wiki(wiki_dir=wiki)
    assert report.contradictions, "una negazione su righe quasi identiche va segnalata"


def test_log_append(wiki_dirs: tuple[Path, Path]) -> None:
    wiki, _ = wiki_dirs
    llm_wiki.append_log("evento di prova", wiki)
    assert "evento di prova" in (wiki / "log.md").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# RAG codebase
# ---------------------------------------------------------------------------

def test_chunking_con_sovrapposizione() -> None:
    testo = "\n".join(f"riga {i}" for i in range(200))
    chunks = chroma_rag.chunk_text(testo, chunk_lines=80, overlap=15)
    assert len(chunks) >= 3
    assert chunks[0][1] == 1
    assert chunks[1][1] == 66  # 80 - 15 + 1: le finestre si sovrappongono
    assert all(c[0].strip() for c in chunks)


def test_chunking_testo_vuoto() -> None:
    assert chroma_rag.chunk_text("") == []


def test_fallback_full_text_trova_il_file_giusto(tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("def movimento_token():\n    pass\n", encoding="utf-8")
    (tmp_path / "b.py").write_text("def audio_procedurale():\n    pass\n", encoding="utf-8")

    hits = chroma_rag.fts_fallback_search(
        "movimento token", root=tmp_path, extensions=(".py",)
    )

    assert hits and hits[0].path == "a.py"
    assert hits[0].source == "fts"


def test_fallback_esclude_cartelle_indicate(tmp_path: Path) -> None:
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "lib.js").write_text("token griglia\n", encoding="utf-8")
    (tmp_path / "vero.js").write_text("token griglia\n", encoding="utf-8")

    hits = chroma_rag.fts_fallback_search(
        "token griglia", root=tmp_path, extensions=(".js",),
        exclude_dirs=frozenset({"node_modules"}),
    )

    assert [h.path for h in hits] == ["vero.js"]


def test_iter_source_files_filtra_per_estensione(tmp_path: Path) -> None:
    (tmp_path / "x.js").write_text("a", encoding="utf-8")
    (tmp_path / "y.txt").write_text("b", encoding="utf-8")
    trovati = [p.name for p in chroma_rag.iter_source_files(tmp_path, (".js",))]
    assert trovati == ["x.js"]


def test_compila_pdf_estrae_il_testo(wiki_dirs: tuple[Path, Path]) -> None:
    """Un PDF con testo selezionabile deve finire nella pagina wiki, non uno stub."""
    # Dipendenze opzionali: saltiamo su QUALSIASI errore di import (non solo
    # ImportError) perché una libreria nativa mal installata non deve far
    # fallire la suite di chi usa l'Hub senza PDF.
    try:
        import pypdf  # noqa: F401, PLC0415
        from reportlab.pdfgen import canvas  # noqa: PLC0415
    except BaseException as exc:  # noqa: BLE001 — pyo3 PanicException non deriva da Exception
        pytest.skip(f"estrazione PDF non testabile in questo ambiente: {type(exc).__name__}")

    wiki, raw = wiki_dirs
    pdf = raw / "manuale.pdf"
    c = canvas.Canvas(str(pdf))
    c.drawString(100, 750, "Le rovine di Ventimiglia custodiscono un artefatto")
    c.save()

    pagina = llm_wiki.compile_raw_source(pdf, wiki_dir=wiki)

    assert "artefatto" in pagina.read_text(encoding="utf-8")


def test_compila_pdf_senza_pypdf_non_esplode(wiki_dirs: tuple[Path, Path], monkeypatch) -> None:
    """Senza pypdf la compilazione deve degradare a stub, non fallire."""
    wiki, raw = wiki_dirs
    pdf = raw / "scansione.pdf"
    pdf.write_bytes(b"%PDF-1.4 finto")
    monkeypatch.setattr(llm_wiki, "extract_pdf_text", lambda *a, **kw: None)

    pagina = llm_wiki.compile_raw_source(pdf, wiki_dir=wiki)

    assert pagina.exists()
    assert "senza testo estraibile" in pagina.read_text(encoding="utf-8")
