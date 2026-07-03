@echo off
REM Lancio rapido del God-Mode Local AI Hub (dopo il primo setup).
REM Doppio click qui o dal collegamento sul Desktop: attiva il venv e apre
REM l'app nel browser predefinito su http://localhost:8501.

cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
    echo.
    echo Ambiente virtuale non trovato in "%~dp0.venv".
    echo Esegui prima il file di setup iniziale ^(setup_god_mode_hub.bat^).
    echo.
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat
echo Avvio God-Mode Local AI Hub su http://localhost:8501 ...
streamlit run app.py

pause
