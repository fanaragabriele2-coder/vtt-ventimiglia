@echo off
REM God-Mode Hub - riparazione automatica TripoSR (doppio click).
REM Opzioni passate allo script PowerShell, es.:
REM   FIX_TRIPOSR.bat -NoModelTest      (salta il test finale che scarica i pesi)
REM   FIX_TRIPOSR.bat -SkipNativeBuild  (va diretto allo shim puro-Python)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix_triposr.ps1" %*
echo.
pause
