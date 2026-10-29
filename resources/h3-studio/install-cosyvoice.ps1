param(
    [string]$InstallRoot = "D:\AI\LocalFrame-Voice"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$downloads = Join-Path $InstallRoot "downloads"
$pythonRoot = Join-Path $InstallRoot "python"
$sourceRoot = Join-Path $InstallRoot "CosyVoice"
$modelsRoot = Join-Path $InstallRoot "models"
$modelRoot = Join-Path $modelsRoot "CosyVoice-300M-Instruct"
$taskTemp = Join-Path $InstallRoot "temp"
$cache = Join-Path $InstallRoot "cache"
$python = Join-Path $pythonRoot "python.exe"

New-Item -ItemType Directory -Force -Path $InstallRoot,$downloads,$modelsRoot,$taskTemp,$cache | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
$env:PIP_CACHE_DIR = Join-Path $cache "pip"
$env:HF_HOME = Join-Path $cache "huggingface"
$env:MODELSCOPE_CACHE = Join-Path $cache "modelscope"

function Report([int]$Percent, [string]$Message) { Write-Output "##progress $Percent $Message" }
function Download([string]$Url, [string]$Destination, [int]$Percent, [string]$Label, [long]$MinimumBytes = 1) {
    if ((Test-Path -LiteralPath $Destination) -and (Get-Item -LiteralPath $Destination).Length -ge $MinimumBytes) { return }
    Report $Percent $Label
    & curl.exe -L --retry 20 --retry-all-errors --retry-delay 5 --connect-timeout 30 -C - $Url -o $Destination
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Label" }
}
function Expand-Repo([string]$Archive, [string]$Target, [string]$Expected) {
    if (Test-Path -LiteralPath (Join-Path $Target $Expected)) { return }
    $rootFull = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') + '\'
    $targetFull = [System.IO.Path]::GetFullPath($Target)
    if (-not $targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe extraction target: $targetFull" }
    $extract = Join-Path $taskTemp ([guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    Expand-Archive -LiteralPath $Archive -DestinationPath $extract -Force
    $folder = Get-ChildItem -LiteralPath $extract -Directory | Select-Object -First 1
    if (-not $folder) { throw "Invalid source archive: $Archive" }
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
    Move-Item -LiteralPath $folder.FullName -Destination $Target
}

if (-not (Test-Path -LiteralPath $python)) {
    $installer = Join-Path $downloads "miniconda-py310.exe"
    Download "https://repo.anaconda.com/miniconda/Miniconda3-py310_24.5.0-0-Windows-x86_64.exe" $installer 4 "Downloading isolated Python 3.10 runtime" 70000000
    Report 10 "Installing isolated voice runtime"
    Start-Process -FilePath $installer -ArgumentList "/InstallationType=JustMe","/RegisterPython=0","/AddToPath=0","/S","/D=$pythonRoot" -Wait -WindowStyle Hidden
}
if (-not (Test-Path -LiteralPath $python)) { throw "Python voice runtime installation failed" }

$cosyArchive = Join-Path $downloads "CosyVoice-main.zip"
Download "https://codeload.github.com/QwenAudio/CosyVoice/zip/refs/heads/main" $cosyArchive 14 "Downloading CosyVoice source" 1000000
Expand-Repo $cosyArchive $sourceRoot "requirements.txt"

$matchaArchive = Join-Path $downloads "Matcha-TTS-main.zip"
Download "https://codeload.github.com/shivammehta25/Matcha-TTS/zip/refs/heads/main" $matchaArchive 18 "Downloading Matcha-TTS component" 100000
$matchaTarget = Join-Path $sourceRoot "third_party\Matcha-TTS"
Expand-Repo $matchaArchive $matchaTarget "matcha"

Report 24 "Installing CosyVoice dependencies"
& $python -m pip install --upgrade pip "setuptools==69.5.1" wheel
& $python -m pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw "PyTorch CPU installation failed" }
$filteredRequirements = Join-Path $taskTemp "cosyvoice-windows-cpu-requirements.txt"
Get-Content -LiteralPath (Join-Path $sourceRoot "requirements.txt") |
    Where-Object { $_ -notmatch '^(--extra-index-url|torch==|torchaudio==|onnxruntime-gpu==|tensorrt-|deepspeed==|openai-whisper==|gradio==|fastapi-cli==|tensorboard==|wetext==)' } |
    Set-Content -LiteralPath $filteredRequirements -Encoding Ascii
& $python -m pip install -r $filteredRequirements -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
if ($LASTEXITCODE -ne 0) { throw "CosyVoice dependency installation failed" }
& $python -m pip install --no-build-isolation "openai-whisper==20231117" -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
if ($LASTEXITCODE -ne 0) { throw "Whisper compatibility dependency installation failed" }

Report 72 "Downloading CosyVoice 300M Instruct model"
$downloadScript = "from modelscope import snapshot_download; snapshot_download('iic/CosyVoice-300M-Instruct', local_dir=r'$modelRoot')"
& $python -c $downloadScript
if ($LASTEXITCODE -ne 0) { throw "CosyVoice model download failed" }
if (-not (Test-Path -LiteralPath (Join-Path $modelRoot "cosyvoice.yaml"))) { throw "CosyVoice model verification failed" }

Report 96 "Verifying local voice engine"
& $python -c "import sys; sys.modules['wetext']=None; sys.path.insert(0, r'$sourceRoot'); sys.path.insert(0, r'$matchaTarget'); from cosyvoice.cli.cosyvoice import AutoModel; m=AutoModel(model_dir=r'$modelRoot'); print(m.list_available_spks())"
if ($LASTEXITCODE -ne 0) { throw "CosyVoice startup verification failed" }
Report 100 "CosyVoice multi-voice environment is ready"
