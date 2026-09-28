param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (Test-Path -LiteralPath $bundled) {
    $python = $bundled
} else {
    $command = Get-Command python -ErrorAction SilentlyContinue
    if (-not $command) { throw 'No se encontro Python 3. Instala Python para abrir el servidor local.' }
    $python = $command.Source
}
for ($port = 8090; $port -lt 8100; $port++) {
    $url = "http://127.0.0.1:$port/"
    try {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($page.Content -match 'SJL 3D \| Territorio y comunidad') { break }
        continue
    } catch {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { continue }
    }
    Start-Process -FilePath $python -ArgumentList '-m','http.server',"$port",'--bind','127.0.0.1' -WorkingDirectory $root -WindowStyle Hidden
    $ready = $false
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try {
            $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($page.StatusCode -eq 200) { $ready=$true; break }
        } catch { }
    }
    if (-not $ready) { throw "El servidor no respondio en $url" }
    break
}
if ($port -ge 8100) { throw 'Los puertos locales 8090-8099 estan ocupados.' }
Write-Output "SJL 3D disponible en $url"
if (-not $NoBrowser) { Start-Process $url }
