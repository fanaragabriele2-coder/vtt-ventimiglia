@echo off
REM God-Mode Hub - setup + avvio one-click.
REM Aggiorna il repo, prepara il venv dell'Hub, segnala lo stato di TripoSR
REM e avvia l'app. Usa sempre "python -m ..." (mai pip.exe/streamlit.exe:
REM Smart App Control blocca gli exe non firmati generati nel venv).

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo ERRORE: Python non trovato nel PATH. Installalo da https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/4] Aggiorno il repository (git pull)...
git pull 2>nul

echo [2/4] Preparo l'ambiente dell'Hub...
if not exist ".venv\Scripts\python.exe" python -m venv .venv
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt

echo [3/4] Stato backend TripoSR...
if defined TRIPOSR_DIR (
    echo     TRIPOSR_DIR = %TRIPOSR_DIR%
) else (
    echo     TripoSR non configurato.
    choice /c SN /t 15 /d N /m "    Eseguire la riparazione automatica adesso (S/N, default N in 15s)"
    if not errorlevel 2 call "%~dp0tools\FIX_TRIPOSR.bat" -NoModelTest
)

echo [4/4] Avvio God-Mode Hub su http://localhost:8501 ...
".venv\Scripts\python.exe" -m streamlit run app.py

pause
