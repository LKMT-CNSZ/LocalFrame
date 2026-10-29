param(
    [string]$InstallRoot = "D:\AI\ComfyUI-H3"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Report([int]$Percent, [string]$Message) {
    Write-Output "##progress $Percent $Message"
}

if (-not [Environment]::Is64BitOperatingSystem) {
    throw "H3 本地环境需要 Windows 10/11 64 位系统"
}
if (-not [IO.Path]::IsPathRooted($InstallRoot)) {
    throw "安装位置必须是完整路径：$InstallRoot"
}
$driveRoot = [IO.Path]::GetPathRoot($InstallRoot)
if (-not (Test-Path -LiteralPath $driveRoot)) {
    throw "安装磁盘不存在或当前不可用：$driveRoot"
}
$driveName = $driveRoot.TrimEnd('\').TrimEnd(':')
$driveInfo = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
if ($driveInfo -and $driveInfo.Free -lt 55GB -and -not (Test-Path -LiteralPath (Join-Path $InstallRoot "ComfyUI_windows_portable\python_embeded\python.exe"))) {
    $freeGb = [math]::Round($driveInfo.Free / 1GB, 1)
    throw "模型盘空间不足：当前剩余 $freeGb GB，首次部署至少需要 55 GB"
}
Report 1 "检查系统、磁盘与下载组件"

$downloads = Join-Path $InstallRoot "downloads"
$cache = Join-Path $InstallRoot "cache"
$taskTemp = Join-Path $InstallRoot "temp"
$tools = Join-Path $InstallRoot "tools"
$portable = Join-Path $InstallRoot "ComfyUI_windows_portable"
$comfy = Join-Path $portable "ComfyUI"
$python = Join-Path $portable "python_embeded\python.exe"
$archive = Join-Path $downloads "ComfyUI_windows_portable_nvidia.7z"
$comfyBytes = 1910039517L
$comfySha256 = '6fb005a8269c6f5972a8fb76d7a4fc251578ccc7906671a801b382591c791dd2'
$seven = Join-Path $tools "7zr.exe"

New-Item -ItemType Directory -Force -Path $downloads,$cache,$taskTemp,$tools | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
$env:PIP_CACHE_DIR = Join-Path $cache "pip"
$env:HF_HOME = Join-Path $cache "huggingface"
$env:HUGGINGFACE_HUB_CACHE = Join-Path $cache "huggingface\hub"
$env:TORCH_HOME = Join-Path $cache "torch"

$aria2 = Get-ChildItem -Path $tools -Filter "aria2c.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $aria2) {
    # Do not make a GitHub-hosted optional accelerator a prerequisite for H3.
    # Windows 10/11 already ships curl, which supports retries and resuming.
    Report 1 "使用 Windows 自带下载器（支持重试和断点续传）"
}

function Invoke-CurlDownload([string]$Url, [string]$Destination, [int]$Percent, [string]$Label, [long]$ExpectedBytes) {
    $script:CurlExitCode = 127
    $script:LastCurlError = ''
    $curlArgs = @(
        '-L', '--silent', '--show-error', '--retry', '8', '--retry-delay', '5', '--connect-timeout', '30',
        '--speed-limit', '1024', '--speed-time', '300', '-C', '-', $Url, '-o', $Destination
    )
    $environmentProxy = $env:HTTPS_PROXY, $env:https_proxy, $env:ALL_PROXY, $env:all_proxy | Where-Object { $_ } | Select-Object -First 1
    if (-not $environmentProxy) {
        try {
            $internetSettings = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop
            if ($internetSettings.ProxyEnable -and $internetSettings.ProxyServer) {
                $proxyEntry = [string]$internetSettings.ProxyServer
                $httpsEntry = @($proxyEntry -split ';' | Where-Object { $_ -match '^https=' }) | Select-Object -First 1
                $httpEntry = @($proxyEntry -split ';' | Where-Object { $_ -match '^http=' }) | Select-Object -First 1
                if ($httpsEntry) { $proxyEntry = $httpsEntry -replace '^https=', '' }
                elseif ($httpEntry) { $proxyEntry = $httpEntry -replace '^http=', '' }
                else { $proxyEntry = ($proxyEntry -split ';')[0] -replace '^[^=]+=','' }
                if ($proxyEntry -and $proxyEntry -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { $proxyEntry = "http://$proxyEntry" }
                if ($proxyEntry) { $curlArgs = @('--proxy', $proxyEntry) + $curlArgs }
            }
        } catch {}
    }
    $quotedArgs = ($curlArgs | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = Join-Path $env:SystemRoot 'System32\curl.exe'
        $startInfo.Arguments = $quotedArgs
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $curl = New-Object System.Diagnostics.Process
        $curl.StartInfo = $startInfo
        if (-not $curl.Start()) { throw 'Windows curl could not be started' }
        $stdoutTask = $curl.StandardOutput.ReadToEndAsync()
        $stderrTask = $curl.StandardError.ReadToEndAsync()
    } catch {
        $script:LastCurlError = $_.Exception.Message
        return
    }

    $startedAt = Get-Date
    $lastReportAt = $startedAt.AddSeconds(-10)
    $lastGrowthAt = $startedAt
    $lastReportedBytes = -1L
    $lastSize = 0L
    $stalledNoticeSent = $false
    while (-not $curl.HasExited) {
        Start-Sleep -Seconds 5
        $curl.Refresh()
        try { $size = (Get-Item -LiteralPath $Destination -ErrorAction Stop).Length } catch { $size = 0L }
        $now = Get-Date
        if ($size -gt $lastSize) {
            $lastSize = $size
            $lastGrowthAt = $now
            $stalledNoticeSent = $false
        }
        if (($now - $lastReportAt).TotalSeconds -ge 10) {
            $interval = [math]::Max(1, ($now - $lastReportAt).TotalSeconds)
            $speedMb = [math]::Round([math]::Max(0, $size - $lastReportedBytes) / 1MB / $interval, 2)
            if ($ExpectedBytes -gt 1) {
                $localPercent = [math]::Min(100, [math]::Floor(($size / [double]$ExpectedBytes) * 100))
                if ($ExpectedBytes -ge 1GB) {
                    $currentText = "$([math]::Round($size / 1GB, 2)) / $([math]::Round($ExpectedBytes / 1GB, 2)) GB"
                } else {
                    $currentText = "$([math]::Round($size / 1MB, 1)) / $([math]::Round($ExpectedBytes / 1MB, 1)) MB"
                }
                Report $Percent "$Label · 已下载 $currentText（$localPercent%，$speedMb MB/s）"
            } else {
                $currentMb = [math]::Round($size / 1MB, 1)
                Report $Percent "$Label · 已下载 $currentMb MB（$speedMb MB/s）"
            }
            $lastReportAt = $now
            $lastReportedBytes = $size
        }
        if (-not $stalledNoticeSent -and ($now - $lastGrowthAt).TotalSeconds -ge 30) {
            Report $Percent "$Label · 暂无新数据；若连续 5 分钟低于 1 KB/s，将自动重试并续传"
            $stalledNoticeSent = $true
        }
    }
    $curl.WaitForExit()
    $curl.Refresh()
    $script:CurlExitCode = $curl.ExitCode
    $script:LastCurlError = $stderrTask.GetAwaiter().GetResult().Trim()
    [void]$stdoutTask.GetAwaiter().GetResult()
}

. (Join-Path $PSScriptRoot 'comfy-download.ps1')

function Download([string]$Url, [string]$Destination, [int]$Percent, [string]$Label, [long]$MinimumBytes = 1, [string]$FallbackUrl = "") {
    $parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $controlFile = "$Destination.aria2"
    if ((Test-Path -LiteralPath $Destination) -and
        -not (Test-Path -LiteralPath $controlFile) -and
        (Get-Item -LiteralPath $Destination).Length -ge $MinimumBytes) { return }
    Report $Percent $Label
    if ($aria2) {
        $fileName = Split-Path -Leaf $Destination
        & $aria2 --continue=true --max-connection-per-server=16 --split=16 --min-split-size=1M --file-allocation=none --auto-file-renaming=false --allow-overwrite=true --summary-interval=10 --dir=$parent --out=$fileName $Url
        $downloadExitCode = $LASTEXITCODE
    } else {
        Invoke-CurlDownload $Url $Destination $Percent $Label $MinimumBytes
        $downloadExitCode = $script:CurlExitCode
    }
    if ($downloadExitCode -ne 0 -and $FallbackUrl) {
        Report $Percent "$Label · 主线路不可用，自动切换备用线路"
        if ($aria2) {
            & $aria2 --continue=true --max-connection-per-server=8 --split=8 --min-split-size=1M --file-allocation=none --auto-file-renaming=false --allow-overwrite=true --summary-interval=10 --dir=$parent --out=$fileName $FallbackUrl
            $downloadExitCode = $LASTEXITCODE
        } else {
            Invoke-CurlDownload $FallbackUrl $Destination $Percent "$Label · 备用线路" $MinimumBytes
            $downloadExitCode = $script:CurlExitCode
        }
    }
    if ($downloadExitCode -ne 0 -and $aria2) {
        Report $Percent "$Label · 加速下载失败，改用 Windows 自带下载器"
        Remove-Item -LiteralPath $controlFile -Force -ErrorAction SilentlyContinue
        Invoke-CurlDownload $Url $Destination $Percent $Label $MinimumBytes
        $downloadExitCode = $script:CurlExitCode
        if ($downloadExitCode -ne 0 -and $FallbackUrl) {
            Report $Percent "$Label · 自动切换备用线路"
            Invoke-CurlDownload $FallbackUrl $Destination $Percent "$Label · 备用线路" $MinimumBytes
            $downloadExitCode = $script:CurlExitCode
        }
    }
    if ($downloadExitCode -ne 0) {
        $detail = if ($script:LastCurlError) { " 下载器信息：$script:LastCurlError" } else { '' }
        throw "下载失败：$Label。请检查网络、代理或安全软件后再次点击继续。$detail"
    }
}

function Assert-Model([string]$File, [long]$ExpectedBytes, [string]$ExpectedSha256, [string]$Label) {
    if (-not (Test-Path -LiteralPath $File)) { throw "模型缺失：$Label" }
    $actualBytes = (Get-Item -LiteralPath $File).Length
    if ($actualBytes -ne $ExpectedBytes) {
        throw "模型大小校验失败：$Label（应为 $ExpectedBytes 字节，实际为 $actualBytes 字节）"
    }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($File)
    try {
        $actualHash = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
    if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
        throw "模型 SHA-256 校验失败：$Label"
    }
}

function Install-NodeZip([string]$Owner, [string]$Repo, [string]$Target, [int]$Percent) {
    if (Test-Path -LiteralPath (Join-Path $Target "__init__.py")) { return }
    $zip = Join-Path $downloads "$Repo-main.zip"
    if (Test-Path -LiteralPath $Target) {
        $backup = "$Target.incomplete-$([DateTime]::Now.ToString('yyyyMMddHHmmss'))"
        Move-Item -LiteralPath $Target -Destination $backup
    }
    $extract = Join-Path $taskTemp ("$Repo-extract-" + [guid]::NewGuid().ToString("N"))
    Download "https://github.com/$Owner/$Repo/archive/refs/heads/main.zip" $zip $Percent "下载节点 $Repo" 10000
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
    $source = Get-ChildItem -LiteralPath $extract -Directory | Select-Object -First 1
    if (-not $source) { throw "节点压缩包内容无效：$Repo" }
    Move-Item -LiteralPath $source.FullName -Destination $Target
}

if (-not (Test-Path -LiteralPath $seven)) {
    Download "https://www.7-zip.org/a/7zr.exe" $seven 2 "下载 7-Zip 解压工具" 500000
}

if (-not (Test-Path -LiteralPath $python)) {
    $comfyUrl = "https://github.com/Comfy-Org/ComfyUI/releases/download/v0.35.0/ComfyUI_windows_portable_nvidia.7z"
    if (-not (Test-Path -LiteralPath $archive) -or (Get-Item -LiteralPath $archive).Length -ne $comfyBytes) {
        $parallelOk = Invoke-ComfyParallelDownload $comfyUrl $archive $comfyBytes 5
        if (-not $parallelOk) {
            Report 5 "多连接线路不可用，使用断点续传下载 ComfyUI"
            Invoke-CurlDownload $comfyUrl $archive 5 "下载 ComfyUI NVIDIA 运行环境（约 1.9GB）" $comfyBytes
            if ($script:CurlExitCode -ne 0) { throw "ComfyUI 下载失败：$script:LastCurlError" }
        }
    }
    Assert-Model $archive $comfyBytes $comfySha256 "ComfyUI NVIDIA 运行环境"
    Report 10 "解压独立运行环境到模型盘"
    & $seven x -y $archive "-o$InstallRoot"
    if ($LASTEXITCODE -ne 0) { throw "ComfyUI 解压失败" }
}

if (-not (Test-Path -LiteralPath $python)) { throw "没有找到 ComfyUI 内置 Python：$python" }

$customNodes = Join-Path $comfy "custom_nodes"
New-Item -ItemType Directory -Force -Path $customNodes | Out-Null
Install-NodeZip "matlowai" "ComfyUI-MAINodes" (Join-Path $customNodes "ComfyUI-MAINodes") 12
Install-NodeZip "kijai" "ComfyUI-KJNodes" (Join-Path $customNodes "ComfyUI-KJNodes") 14
Install-NodeZip "PlagueKind" "ComfyUI-PlagueKind-Nodes" (Join-Path $customNodes "ComfyUI-PlagueKind-Nodes") 16
Install-NodeZip "xmarre" "ComfyUI-Spectrum-MiniMax-H3" (Join-Path $customNodes "ComfyUI-Spectrum-MiniMax-H3") 17
Install-NodeZip "Comfy-Org" "ComfyUI-Manager" (Join-Path $customNodes "ComfyUI-Manager") 18

Report 19 "安装自定义节点 Python 依赖"
Get-ChildItem -LiteralPath $customNodes -Directory | ForEach-Object {
    $requirements = Join-Path $_.FullName "requirements.txt"
    if (Test-Path -LiteralPath $requirements) {
        & $python -s -m pip install -r $requirements
        if ($LASTEXITCODE -ne 0) { throw "节点依赖安装失败：$($_.Name)" }
    }
}

& $python -s -c "import triton" 2>$null
if ($LASTEXITCODE -ne 0) {
    Report 22 "安装 Windows Triton 稀疏注意力运行库"
    & $python -s -m pip install triton-windows
    if ($LASTEXITCODE -ne 0) { throw "Triton Windows 安装失败" }
}

# Embedded Python does not always include the C headers/import library that
# Triton needs to compile its small CUDA driver module. Importing triton alone
# does not expose the problem; the first real kernel then fails on Python.h.
$pythonRoot = Split-Path -Parent $python
$pythonHeader = Join-Path $pythonRoot "include\Python.h"
$pythonImportLib = Join-Path $pythonRoot "libs\python313.lib"
if (-not (Test-Path -LiteralPath $pythonHeader) -or -not (Test-Path -LiteralPath $pythonImportLib)) {
    Report 23 "补齐 Triton 所需的 Python 3.13 开发文件"
    $pythonDevZip = Join-Path $downloads "python_3.13.2_include_libs.zip"
    $pythonDevExtract = Join-Path $taskTemp ("python-dev-" + [guid]::NewGuid().ToString("N"))
    Download "https://github.com/woct0rdho/triton-windows/releases/download/v3.0.0-windows.post1/python_3.13.2_include_libs.zip" $pythonDevZip 23 "下载 Python 3.13 开发文件" 500000
    Expand-Archive -LiteralPath $pythonDevZip -DestinationPath $pythonDevExtract -Force
    foreach ($folderName in @("include", "libs")) {
        $sourceFolder = Join-Path $pythonDevExtract $folderName
        $targetFolder = Join-Path $pythonRoot $folderName
        New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null
        Get-ChildItem -LiteralPath $sourceFolder -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $targetFolder -Recurse -Force
        }
    }
    Remove-Item -LiteralPath $pythonDevExtract -Recurse -Force
}
if (-not (Test-Path -LiteralPath $pythonHeader)) { throw "Triton 修复失败：缺少 Python.h" }
if (-not (Test-Path -LiteralPath $pythonImportLib)) { throw "Triton 修复失败：缺少 python313.lib" }

$diffusion = Join-Path $comfy "models\diffusion_models\minimax_h3_fused_refdelta_r1024_turbo8_mystic07_int8_convrot.safetensors"
$encoder = Join-Path $comfy "models\text_encoders\qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors"
$videoVae = Join-Path $comfy "models\vae\minimax_h3_video_vae_int8_convrot.safetensors"
$audioVae = Join-Path $comfy "models\vae\minimax_h3_audio_vae_fp32.safetensors"

Download "https://hf-mirror.com/MATLOWAI/minimax-h3-fused-turbo-int8-convrot/resolve/main/diffusion_models/minimax_h3_fused_refdelta_r1024_turbo8_mystic07_int8_convrot.safetensors" $diffusion 25 "下载 INT8 主视频模型（约 21GB）" 20900000000 "https://huggingface.co/MATLOWAI/minimax-h3-fused-turbo-int8-convrot/resolve/main/diffusion_models/minimax_h3_fused_refdelta_r1024_turbo8_mystic07_int8_convrot.safetensors"
Download "https://hf-mirror.com/Momoking/Qwen3-VL-32B-Heretic-MiniMax-H3-NVFP4/resolve/main/qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors" $encoder 55 "下载 NVFP4 自由文本编码器（约 15.7GB）" 15600000000 "https://huggingface.co/Momoking/Qwen3-VL-32B-Heretic-MiniMax-H3-NVFP4/resolve/main/qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors"
Download "https://hf-mirror.com/GuangyuanSD/minimax_h3_video_vae_int8_convrot/resolve/main/minimax_h3_video_vae_int8_convrot.safetensors" $videoVae 82 "下载 INT8 视频 VAE（约 3.2GB）" 3100000000 "https://huggingface.co/GuangyuanSD/minimax_h3_video_vae_int8_convrot/resolve/main/minimax_h3_video_vae_int8_convrot.safetensors"

Report 90 "校验三套核心模型完整性"
Assert-Model $diffusion 20980178976 "4262e4e9963c553fa00016bbe83961407a4fc0a888be95fd836c8d4f2304e48b" "INT8 主视频模型"
Assert-Model $encoder 15683129587 "a166c7bbbe66a22065159e478335fee4a633c4a3e3bb34c8e8ac4cc91bf4996f" "NVFP4 文本编码器"
Assert-Model $videoVae 3171670912 "9bb2d96f218c76babd85e0611b85ca8fb330a90546c01a0005e8a58a59593410" "INT8 视频 VAE"

if (-not (Test-Path -LiteralPath $audioVae)) {
    $storageRoot = Split-Path -Parent $InstallRoot
    $existingAudio = Join-Path $storageRoot "MiniMax-H3\models\minimax_h3_audio_vae_fp32.safetensors"
    if (Test-Path -LiteralPath $existingAudio) {
        Report 91 "复用现有音频 VAE"
        Copy-Item -LiteralPath $existingAudio -Destination $audioVae
    } else {
        Download "https://hf-mirror.com/Comfy-Org/MiniMax-H3_ComfyUI/resolve/main/split_files/vae/minimax_h3_audio_vae_fp32.safetensors" $audioVae 91 "下载音频 VAE"
    }
}

$ffmpegExe = Join-Path $tools "ffmpeg\bin\ffmpeg.exe"
if (-not (Test-Path -LiteralPath $ffmpegExe)) {
    $ffmpegZip = Join-Path $downloads "ffmpeg-release-essentials.zip"
    $ffmpegExtract = Join-Path $taskTemp ("ffmpeg-extract-" + [guid]::NewGuid().ToString("N"))
    Download "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" $ffmpegZip 94 "下载长视频拼接与 1080p 输出组件" 50000000
    Expand-Archive -LiteralPath $ffmpegZip -DestinationPath $ffmpegExtract -Force
    $ffmpegFolder = Get-ChildItem -LiteralPath $ffmpegExtract -Directory | Select-Object -First 1
    if (Test-Path -LiteralPath (Join-Path $tools "ffmpeg")) {
        $brokenFfmpeg = (Join-Path $tools "ffmpeg.incomplete-$([DateTime]::Now.ToString('yyyyMMddHHmmss'))")
        Move-Item -LiteralPath (Join-Path $tools "ffmpeg") -Destination $brokenFfmpeg
    }
    Move-Item -LiteralPath $ffmpegFolder.FullName -Destination (Join-Path $tools "ffmpeg")
}

Report 100 "INT8 高质量环境安装完成"
