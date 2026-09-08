@echo off
REM Esegue la suite di test del God-Mode Hub.
REM Doppio click qui per verificare che tutto funzioni dopo una modifica.
REM
REM I test non toccano mai i tuoi file reali: girano su cartelle temporanee.
REM Quelli che richiedono componenti opzionali (Playwright, pypdf) vengono
REM saltati automaticamente se non li hai installati: e' normale, non e' un errore.

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo Ambiente virtuale non trovato in "%~dp0.venv".
    echo Esegui prima il setup iniziale.
    echo.
    pause
    exit /b 1
)

echo Installazione/verifica di pytest...
".venv\Scripts\python.exe" -m pip install -q pytest

echo.
echo === Suite di test God-Mode Hub ===
".venv\Scripts\python.exe" -m pytest

echo.
echo Legenda: . = superato   s = saltato (componente opzionale assente)   F = FALLITO
pause
