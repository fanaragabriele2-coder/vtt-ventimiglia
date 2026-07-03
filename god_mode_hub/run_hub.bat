@echo off
REM Lancio rapido del God-Mode Local AI Hub (dopo il primo setup).
REM Doppio click qui o dal collegamento sul Desktop: apre l'app nel browser
REM predefinito su http://localhost:8501.
REM
REM NOTA: usiamo ".venv\Scripts\python.exe -m streamlit" invece di attivare
REM il venv e lanciare "streamlit.exe" direttamente. Questo evita due
REM problemi comuni su Windows: (1) l'Execution Policy di PowerShell che
REM blocca Activate.ps1, e (2) Smart App Control / Controllo app intelligente
REM che puo' bloccare l'esecuzione di eseguibili non firmati generati nel
REM venv (pip.exe, streamlit.exe). python.exe e' gia' firmato/fidato: con
REM "-m" il modulo gira dentro il suo processo, senza lanciare un binario
REM separato che possa essere bloccato.

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo Ambiente virtuale non trovato in "%~dp0.venv".
    echo Esegui prima il file di setup iniziale ^(setup_god_mode_hub.bat^).
    echo.
    pause
    exit /b 1
)

echo Avvio God-Mode Local AI Hub su http://localhost:8501 ...
".venv\Scripts\python.exe" -m streamlit run app.py

pause
