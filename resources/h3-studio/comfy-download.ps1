# Dedicated, resumable multi-connection downloader for the pinned ComfyUI archive.
# Every byte is checked against the official release size and SHA-256 by the caller.
function Get-ComfyCurlProxyArgs {
    if ($env:HTTPS_PROXY -or $env:https_proxy -or $env:ALL_PROXY -or $env:all_proxy) { return @() }
    try {
        $settings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop
        if (-not $settings.ProxyEnable -or -not $settings.ProxyServer) { return @() }
        $entry = [string]$settings.ProxyServer
        $https = @($entry -split ';' | Where-Object { $_ -match '^https=' }) | Select-Object -First 1
        $http = @($entry -split ';' | Where-Object { $_ -match '^http=' }) | Select-Object -First 1
        if ($https) { $entry = $https -replace '^https=', '' }
        elseif ($http) { $entry = $http -replace '^http=', '' }
        else { $entry = ($entry -split ';')[0] -replace '^[^=]+=', '' }
        if ($entry -and $entry -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { $entry = "http://$entry" }
        if ($entry) { return @('--proxy', $entry) }
    } catch {}
    return @()
}

function Start-ComfyCurl([string[]]$CurlArgs) {
    $allArgs = @(Get-ComfyCurlProxyArgs) + $CurlArgs
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Join-Path $env:SystemRoot 'System32\curl.exe'
    $startInfo.Arguments = ($allArgs | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.RedirectStandardOutput = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw 'Windows curl could not be started' }
    return [pscustomobject]@{
        Process = $process
        Stderr = $process.StandardError.ReadToEndAsync()
        Stdout = $process.StandardOutput.ReadToEndAsync()
    }
}

function Get-ComfyContentRange([string]$HeaderPath) {
    if (-not (Test-Path -LiteralPath $HeaderPath)) { return $null }
    $matches = @([regex]::Matches([IO.File]::ReadAllText($HeaderPath), '(?im)^content-range:\s*bytes\s+(\d+)-(\d+)/(\d+)\s*$'))
    if (-not $matches.Count) { return $null }
    $match = $matches[-1]
    return @([long]$match.Groups[1].Value, [long]$match.Groups[2].Value, [long]$match.Groups[3].Value)
}

function Invoke-ComfyParallelDownload([string]$Url, [string]$Destination, [long]$ExpectedBytes, [int]$Percent) {
    $prefix = 0L
    if (Test-Path -LiteralPath $Destination) { $prefix = (Get-Item -LiteralPath $Destination).Length }
    if ($prefix -ge $ExpectedBytes) { return $false }
    $probe = "$Destination.range-probe"
    $probeHeaders = "$probe.headers"
    try {
        $request = Start-ComfyCurl @('-L','--silent','--show-error','--fail','--connect-timeout','15','--max-time','45','--range',"$prefix-$prefix",'--dump-header',$probeHeaders,'--output',$probe,$Url)
        $request.Process.WaitForExit()
        [void]$request.Stderr.GetAwaiter().GetResult()
        [void]$request.Stdout.GetAwaiter().GetResult()
        $range = Get-ComfyContentRange $probeHeaders
        if ($request.Process.ExitCode -ne 0 -or -not $range -or $range[0] -ne $prefix -or $range[1] -ne $prefix -or $range[2] -ne $ExpectedBytes -or (Get-Item -LiteralPath $probe).Length -ne 1) {
            Report $Percent '下载线路不支持可靠的分段请求'
            return $false
        }
    } catch {
        Report $Percent "分段下载探测失败：$($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item -LiteralPath $probe,$probeHeaders -Force -ErrorAction SilentlyContinue
    }

    $partCount = 8
    $remaining = $ExpectedBytes - $prefix
    $chunkBytes = [long][math]::Ceiling($remaining / [double]$partCount)
    $chunks = @()
    for ($index = 0; $index -lt $partCount; $index++) {
        $start = $prefix + $index * $chunkBytes
        if ($start -ge $ExpectedBytes) { break }
        $end = [long][math]::Min($ExpectedBytes - 1, $start + $chunkBytes - 1)
        $path = "$Destination.part$index"
        $headers = "$path.headers"
        $length = $end - $start + 1
        $complete = (Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -eq $length -and (Test-Path -LiteralPath $headers)
        if ($complete) {
            $partRange = Get-ComfyContentRange $headers
            $complete = $partRange -and $partRange[0] -eq $start -and $partRange[1] -eq $end -and $partRange[2] -eq $ExpectedBytes
        }
        $chunks += [pscustomobject]@{ Start=$start; End=$end; Path=$path; Headers=$headers; Length=$length; Complete=$complete; Request=$null }
    }
    Report $Percent "ComfyUI 多连接下载：8 路，已有 $([math]::Round($prefix / 1MB, 1)) MB 可续传"
    try {
        foreach ($chunk in $chunks) {
            if ($chunk.Complete) { continue }
            Remove-Item -LiteralPath $chunk.Path,$chunk.Headers -Force -ErrorAction SilentlyContinue
            $chunk.Request = Start-ComfyCurl @('-L','--silent','--show-error','--fail','--retry','3','--retry-delay','2','--connect-timeout','20','--speed-limit','1024','--speed-time','90','--range',"$($chunk.Start)-$($chunk.End)",'--dump-header',$chunk.Headers,'--output',$chunk.Path,$Url)
        }
        $lastReport = (Get-Date).AddSeconds(-10)
        while (@($chunks | Where-Object { $_.Request -and -not $_.Request.Process.HasExited }).Count -gt 0) {
            Start-Sleep -Seconds 2
            if (((Get-Date) - $lastReport).TotalSeconds -lt 10) { continue }
            $downloaded = $prefix
            foreach ($chunk in $chunks) {
                if (Test-Path -LiteralPath $chunk.Path) { $downloaded += [math]::Min($chunk.Length, (Get-Item -LiteralPath $chunk.Path).Length) }
            }
            Report $Percent "ComfyUI 多连接下载：$([math]::Round($downloaded / 1MB, 1)) / $([math]::Round($ExpectedBytes / 1MB, 1)) MB（$([math]::Floor($downloaded * 100 / $ExpectedBytes))%）"
            $lastReport = Get-Date
        }
        foreach ($chunk in $chunks) {
            if ($chunk.Request) {
                $chunk.Request.Process.WaitForExit()
                $errorText = $chunk.Request.Stderr.GetAwaiter().GetResult().Trim()
                [void]$chunk.Request.Stdout.GetAwaiter().GetResult()
                if ($chunk.Request.Process.ExitCode -ne 0) { throw "分段 $($chunk.Start)-$($chunk.End) 下载失败：$errorText" }
            }
            $range = Get-ComfyContentRange $chunk.Headers
            if (-not $range -or $range[0] -ne $chunk.Start -or $range[1] -ne $chunk.End -or $range[2] -ne $ExpectedBytes -or (Get-Item -LiteralPath $chunk.Path).Length -ne $chunk.Length) {
                throw "分段 $($chunk.Start)-$($chunk.End) 校验失败"
            }
        }
        $assembled = "$Destination.assembling"
        $output = [IO.File]::Create($assembled)
        try {
            if ($prefix) {
                $source = [IO.File]::OpenRead($Destination)
                try { $source.CopyTo($output) } finally { $source.Dispose() }
            }
            foreach ($chunk in $chunks) {
                $source = [IO.File]::OpenRead($chunk.Path)
                try { $source.CopyTo($output) } finally { $source.Dispose() }
            }
        } finally { $output.Dispose() }
        if ((Get-Item -LiteralPath $assembled).Length -ne $ExpectedBytes) { throw 'ComfyUI 合并后的大小不正确' }
        Move-Item -LiteralPath $assembled -Destination $Destination -Force
        foreach ($chunk in $chunks) { Remove-Item -LiteralPath $chunk.Path,$chunk.Headers -Force -ErrorAction SilentlyContinue }
        return $true
    } catch {
        Report $Percent "多连接下载未完成：$($_.Exception.Message)"
        foreach ($chunk in $chunks) {
            if ($chunk.Request -and -not $chunk.Request.Process.HasExited) { $chunk.Request.Process.Kill() }
        }
        return $false
    }
}
