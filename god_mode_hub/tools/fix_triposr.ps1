<#
 God-Mode Hub - Riparazione automatica TripoSR su Windows.

 Risolve in autonomia le cause radice diagnosticate:
  RC1  build x86 selezionata dal Developer Command Prompt (cudart.lib cercata
       in lib/Win32) -> forza toolchain MSVC x64 + CMAKE_GENERATOR_PLATFORM=x64
  RC2  integrazione CUDA<->Visual Studio assente -> tenta la copia dei file
       MSBuild; se impossibile, usa la strada CPU/shim (equivalente)
  RC3  torch cu124 non supporta la RTX 50xx (Blackwell, sm_120) -> upgrade
       automatico a una build cu128
  RC4  transazione pip abortita -> reinstalla i requirements filtrati
  RC5  rembg senza onnxruntime -> installazione esplicita
  Tutte le invocazioni usano "python -m" (mai pip.exe: Smart App Control
  blocca gli exe non firmati generati nel venv).

 Uso: doppio click su FIX_TRIPOSR.bat, oppure:
   powershell -NoProfile -ExecutionPolicy Bypass -File fix_triposr.ps1 `
       [-SkipNativeBuild] [-NoModelTest] [-TripoDir <path>]
#>
param(
    [switch]$SkipNativeBuild,
    [switch]$NoModelTest,
    [string]$TripoDir = "$env:USERPROFILE\Desktop\TripoSR"
)

$ErrorActionPreference = "Continue"
$script:OkList = @()
$script:FailList = @()
$LogFile = Join-Path $PSScriptRoot "fix_triposr.log"
try { Start-Transcript -Path $LogFile -Force | Out-Null } catch {}

function Step($msg) { Write-Host ""; Write-Host ("=== " + $msg + " ===") -ForegroundColor Cyan }
function Ok($msg)   { $script:OkList += $msg;   Write-Host ("[OK]   " + $msg) -ForegroundColor Green }
function Bad($msg)  { $script:FailList += $msg; Write-Host ("[FAIL] " + $msg) -ForegroundColor Red }
function Warn($msg) { Write-Host ("[WARN] " + $msg) -ForegroundColor Yellow }

# ---------------------------------------------------------------- 0. prerequisiti
Step "Prerequisiti"
$missing = $false
foreach ($tool in @("git", "python")) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) { Ok "$tool trovato" }
    else { Bad "$tool non nel PATH"; $missing = $true }
}
if ($missing) { try { Stop-Transcript | Out-Null } catch {}; exit 1 }

# ---------------------------------------------------------------- 1. repo + venv
Step "Repo TripoSR e ambiente virtuale"
if (-not (Test-Path (Join-Path $TripoDir "run.py"))) {
    Write-Host "Clono TripoSR in $TripoDir ..."
    git clone https://github.com/VAST-AI-Research/TripoSR $TripoDir
}
$Py = Join-Path $TripoDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Py)) { python -m venv (Join-Path $TripoDir ".venv") }
if (Test-Path $Py) { Ok "venv: $Py" }
else { Bad "impossibile creare il venv in $TripoDir"; try { Stop-Transcript | Out-Null } catch {}; exit 1 }
& $Py -m pip install --upgrade pip setuptools wheel --quiet

# ---------------------------------------------------------------- 2. GPU
Step "Rilevamento GPU"
$computeCap = ""
$gpuName = ""
try {
    $gpuInfo = & nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader 2>$null
    if ($gpuInfo) {
        $parts = ($gpuInfo | Select-Object -First 1) -split ","
        $gpuName = $parts[0].Trim()
        if ($parts.Count -gt 1) { $computeCap = $parts[1].Trim() }
        Ok "GPU: $gpuName (compute capability $computeCap)"
    }
} catch {}
if (-not $computeCap) { Warn "nvidia-smi non disponibile o compute_cap non rilevata" }

# ---------------------------------------------------------------- 3. PyTorch adatto alla GPU
Step "Verifica PyTorch nel venv TripoSR"
$probeFile = Join-Path $env:TEMP "gmh_probe_torch.py"
@'
import json
out = {"v": None, "cu": None, "archs": [], "err": None}
try:
    import torch
    out["v"] = torch.__version__
    out["cu"] = str(torch.version.cuda)
    try:
        out["archs"] = torch.cuda.get_arch_list()
    except Exception:
        pass
except Exception as exc:
    out["err"] = str(exc)
print(json.dumps(out))
'@ | Set-Content -Path $probeFile -Encoding ASCII

function Get-TorchState {
    $raw = & $Py $probeFile 2>$null | Select-Object -Last 1
    if ($raw) { return ($raw | ConvertFrom-Json) }
    return $null
}

$torchState = Get-TorchState
$needBlackwell = ($computeCap -like "12*")
$needInstall = $false
if (-not $torchState -or $torchState.err -or -not $torchState.v) {
    Warn "torch non installato nel venv"
    $needInstall = $true
} else {
    Write-Host ("torch " + $torchState.v + " (cuda " + $torchState.cu + ") archs: " + ($torchState.archs -join " "))
    if ($needBlackwell -and ($torchState.archs -notcontains "sm_120")) {
        Warn "RC3: questa build di torch NON supporta la GPU Blackwell (manca sm_120)"
        $needInstall = $true
    }
}
if ($needInstall) {
    $idx = "https://download.pytorch.org/whl/cu126"
    if ($needBlackwell -or -not $computeCap) { $idx = "https://download.pytorch.org/whl/cu128" }
    Write-Host "Installo torch/torchvision da $idx (puo' richiedere alcuni minuti)..."
    & $Py -m pip install --upgrade torch torchvision --index-url $idx
    if ($LASTEXITCODE -ne 0) { Bad "installazione torch da $idx fallita" }
    else {
        $torchState = Get-TorchState
        if ($torchState -and $torchState.v) { Ok ("torch aggiornato a " + $torchState.v + " (cuda " + $torchState.cu + ")") }
    }
}
# test reale su GPU
$cudaOk = $false
$cudaTest = Join-Path $env:TEMP "gmh_test_cuda.py"
@'
import torch
assert torch.cuda.is_available(), "torch.cuda.is_available() == False"
x = torch.rand(256, 256, device="cuda")
y = (x @ x).sum().item()
print("cuda-op-ok", torch.cuda.get_device_name(0))
'@ | Set-Content -Path $cudaTest -Encoding ASCII
& $Py $cudaTest
if ($LASTEXITCODE -eq 0) { $cudaOk = $true; Ok "operazione reale su GPU riuscita" }
else { Bad "torch non riesce a usare la GPU (l'inferenza andra' su CPU: lenta ma funzionante)" }

# ---------------------------------------------------------------- 4. toolchain MSVC x64 (RC1)
Step "Toolchain MSVC x64"
$vsPath = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
}
if ($vsPath) {
    $vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
    if (Test-Path $vcvars) {
        cmd /c "`"$vcvars`" >nul 2>&1 && set" | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
        [System.Environment]::SetEnvironmentVariable("CMAKE_GENERATOR_PLATFORM", "x64", "Process")
        Ok "vcvars64 importato da $vsPath - piattaforma forzata a x64 (fix RC1)"
    } else { Warn "vcvars64.bat non trovato in $vsPath"; $SkipNativeBuild = $true }
} else {
    Warn "Visual Studio Build Tools non rilevati: salto la build nativa (usero' lo shim)"
    $SkipNativeBuild = $true
}

# ---------------------------------------------------------------- 5. integrazione CUDA<->VS (RC2, best effort)
Step "Integrazione CUDA / Visual Studio (facoltativa)"
if ($vsPath -and $env:CUDA_PATH) {
    $srcInt = Join-Path $env:CUDA_PATH "extras\visual_studio_integration\MSBuildExtensions"
    $found = $false
    $vcRoots = Get-ChildItem (Join-Path $vsPath "MSBuild\Microsoft\VC") -Directory -ErrorAction SilentlyContinue
    foreach ($root in $vcRoots) {
        $dst = Join-Path $root.FullName "BuildCustomizations"
        if (-not (Test-Path $dst)) { continue }
        if (Get-ChildItem $dst -Filter "CUDA *.props" -ErrorAction SilentlyContinue) { $found = $true; continue }
        if (Test-Path $srcInt) {
            try {
                Copy-Item (Join-Path $srcInt "*") $dst -Force -ErrorAction Stop
                $found = $true
                Ok "file di integrazione CUDA copiati in $dst"
            } catch {
                Warn ("copia integrazione CUDA fallita (servono privilegi admin): " + $_.Exception.Message)
            }
        }
    }
    if ($found) { Ok "integrazione CUDA-VS presente: la build nativa puo' compilare i kernel" }
    else { Warn "integrazione CUDA-VS assente: la build nativa sara' CPU-only (va bene comunque)" }
} else { Warn "CUDA_PATH o Visual Studio assenti: nessuna integrazione da verificare" }

# ---------------------------------------------------------------- 6. torchmcubes: nativo -> shim
Step "torchmcubes"
$mcTest = Join-Path $env:TEMP "gmh_test_mc.py"
@'
import numpy as np
import torch
import torchmcubes
r = 32
g = np.mgrid[:r, :r, :r].astype("float32")
c = (r - 1) / 2.0
u = (r * 0.35) ** 2 - ((g[0] - c) ** 2 + (g[1] - c) ** 2 + (g[2] - c) ** 2)
v, f = torchmcubes.marching_cubes(torch.from_numpy(u), 0.0)
assert v.shape[0] > 200 and f.shape[0] > 200, (v.shape, f.shape)
print("mc-ok", "verts=%d" % v.shape[0], "faces=%d" % f.shape[0],
      "shim=%s" % getattr(torchmcubes, "IS_SHIM", False))
'@ | Set-Content -Path $mcTest -Encoding ASCII

$mcOk = $false
& $Py $mcTest 2>$null
if ($LASTEXITCODE -eq 0) { $mcOk = $true; Ok "torchmcubes gia' funzionante, nessuna build necessaria" }

if (-not $mcOk -and -not $SkipNativeBuild) {
    Write-Host "Tentativo 1: build nativa di torchmcubes (toolchain x64)..."
    & $Py -m pip uninstall -y torchmcubes 2>$null | Out-Null
    & $Py -m pip install --no-cache-dir "git+https://github.com/tatsy/torchmcubes.git"
    if ($LASTEXITCODE -eq 0) {
        & $Py $mcTest
        if ($LASTEXITCODE -eq 0) { $mcOk = $true; Ok "torchmcubes NATIVO compilato e verificato" }
    }
    if (-not $mcOk) { Warn "build nativa fallita: passo allo shim puro-Python (equivalente)" }
}

if (-not $mcOk) {
    Write-Host "Tentativo 2: shim torchmcubes puro-Python (nessuna compilazione)..."
    & $Py -m pip uninstall -y torchmcubes 2>$null | Out-Null
    & $Py -m pip install --quiet PyMCubes scikit-image
    $shimDir = Join-Path $PSScriptRoot "torchmcubes_shim"
    & $Py -m pip install --force-reinstall "$shimDir"
    if ($LASTEXITCODE -eq 0) {
        & $Py $mcTest
        if ($LASTEXITCODE -eq 0) { $mcOk = $true; Ok "shim torchmcubes installato e verificato" }
    }
}
if (-not $mcOk) { Bad "torchmcubes non funzionante ne' nativo ne' shim (vedi log)" }

# ---------------------------------------------------------------- 7. requirements filtrati (RC4) + onnxruntime (RC5)
Step "Dipendenze TripoSR"
$req = Join-Path $TripoDir "requirements.txt"
if (Test-Path $req) {
    $reqFiltered = Join-Path $env:TEMP "gmh_triposr_requirements.txt"
    Get-Content $req | Where-Object { $_ -notmatch "torchmcubes" } | Set-Content $reqFiltered -Encoding ASCII
    & $Py -m pip install -r $reqFiltered
    if ($LASTEXITCODE -eq 0) { Ok "requirements TripoSR installati (torchmcubes gestito a parte)" }
    else { Bad "installazione requirements TripoSR fallita" }
} else { Bad "requirements.txt non trovato in $TripoDir" }
& $Py -m pip install --quiet onnxruntime
if ($LASTEXITCODE -eq 0) { Ok "onnxruntime installato (richiesto da rembg a runtime - RC5)" }
else { Warn "installazione onnxruntime fallita: rembg potrebbe non funzionare" }

# ---------------------------------------------------------------- 8. variabili d'ambiente per l'Hub
Step "Variabili d'ambiente"
[Environment]::SetEnvironmentVariable("TRIPOSR_DIR", $TripoDir, "User")
[Environment]::SetEnvironmentVariable("TRIPOSR_PYTHON", $Py, "User")
Ok "TRIPOSR_DIR e TRIPOSR_PYTHON impostate (permanenti, utente). Riapri i terminali/l'Hub per vederle."

# ---------------------------------------------------------------- 9. verifica finale reale
Step "Verifica finale"
$importTest = Join-Path $env:TEMP "gmh_test_imports.py"
@'
mods = ["torch", "torchmcubes", "trimesh", "rembg", "PIL", "omegaconf", "einops", "transformers", "onnxruntime"]
bad = []
for m in mods:
    try:
        __import__(m)
    except Exception as exc:
        bad.append("%s: %s" % (m, exc))
if bad:
    raise SystemExit("import falliti -> " + " | ".join(bad))
print("imports-ok", " ".join(mods))
'@ | Set-Content -Path $importTest -Encoding ASCII
& $Py $importTest
if ($LASTEXITCODE -eq 0) { Ok "import di tutti i moduli chiave riusciti" } else { Bad "alcuni import falliscono (vedi sopra)" }

Push-Location $TripoDir
& $Py run.py --help *> $null
if ($LASTEXITCODE -eq 0) { Ok "entrypoint TripoSR (run.py) importa ed esegue" }
else { Bad "run.py --help fallisce: la pipeline TripoSR non parte" }

if (-not $NoModelTest -and $script:FailList.Count -eq 0) {
    Step "Test end-to-end reale (scarica i pesi del modello ~1.5 GB al primo avvio)"
    $outDir = Join-Path $TripoDir "output_fixtest"
    $deviceArgs = @()
    if (-not $cudaOk) { $deviceArgs = @("--device", "cpu") }
    & $Py run.py (Join-Path $TripoDir "examples\chair.png") --output-dir $outDir --model-save-format glb @deviceArgs
    $glb = Get-ChildItem $outDir -Recurse -Filter "*.glb" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($glb) { Ok ("PIPELINE COMPLETA VERIFICATA: generato " + $glb.FullName) }
    else { Bad "run.py non ha prodotto un .glb (vedi output sopra)" }
} elseif ($NoModelTest) {
    Warn "test end-to-end saltato (-NoModelTest)"
}
Pop-Location

# ---------------------------------------------------------------- 10. Stable Diffusion (solo stato)
Step "Stato Stable Diffusion (:7860)"
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:7860/sdapi/v1/options" -TimeoutSec 3 -UseBasicParsing | Out-Null
    Ok "API Stable Diffusion attiva su :7860"
} catch {
    Warn "SD non raggiungibile: apri Stability Matrix -> Launch Options del pacchetto WebUI -> aggiungi --api -> Launch"
}

# ---------------------------------------------------------------- riepilogo
Step "RIEPILOGO"
foreach ($m in $script:OkList)   { Write-Host ("[OK]   " + $m) -ForegroundColor Green }
foreach ($m in $script:FailList) { Write-Host ("[FAIL] " + $m) -ForegroundColor Red }
Write-Host ""
Write-Host ("Log completo: " + $LogFile)
try { Stop-Transcript | Out-Null } catch {}
if ($script:FailList.Count -gt 0) { exit 1 } else { exit 0 }
