[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsDir = Join-Path $projectRoot 'tools\llama.cpp'
$archivePath = Join-Path $projectRoot 'tools\llama.cpp-vulkan.zip'
$modelsDir = Join-Path $projectRoot 'models'
$modelPath = Join-Path $modelsDir 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
$expectedModelHash = '85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9'
$expectedModelBytes = 2497280480
$serverPath = Join-Path $toolsDir 'llama-server.exe'

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null

if (-not (Test-Path -LiteralPath $serverPath)) {
    Write-Host 'Downloading the latest official llama.cpp Vulkan release...'
    $release = Invoke-RestMethod `
        -Uri 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest' `
        -Headers @{ 'User-Agent' = 'Angela-Setup' }
    $asset = $release.assets |
        Where-Object { $_.name -like '*bin-win-vulkan-x64.zip' } |
        Select-Object -First 1
    if (-not $asset) {
        throw 'Could not find the llama.cpp Vulkan package for Windows x64.'
    }
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archivePath
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDir -Force
    Write-Host "Installed $($asset.name), SHA256 $archiveHash"
}

$modelNeedsDownload = -not (Test-Path -LiteralPath $modelPath)
if (-not $modelNeedsDownload) {
    $existingModelBytes = (Get-Item -LiteralPath $modelPath).Length
    if ($existingModelBytes -gt $expectedModelBytes) {
        throw "The model file is larger than expected ($existingModelBytes bytes). Move it aside and run setup again."
    }
    $modelNeedsDownload = $existingModelBytes -lt $expectedModelBytes
}

if ($modelNeedsDownload) {
    Write-Host 'Downloading Qwen3 4B Instruct 2507 Q4_K_M (about 2.5 GB). Interrupted downloads can resume.'
    $modelUrl = "https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:$expectedModelHash"
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & $curl.Source --location --fail --retry 3 --continue-at - --output $modelPath $modelUrl
        if ($LASTEXITCODE -ne 0) {
            throw "Model download failed with exit code $LASTEXITCODE."
        }
    }
    else {
        Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
    }
}

if (-not (Test-Path -LiteralPath $serverPath)) {
    throw 'llama-server.exe is missing after installation.'
}
$actualModelBytes = (Get-Item -LiteralPath $modelPath).Length
if ($actualModelBytes -ne $expectedModelBytes) {
    throw "The model file is incomplete ($actualModelBytes of $expectedModelBytes bytes). Run this script again to resume."
}
$modelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($modelHash -ne $expectedModelHash) {
    throw "Model SHA256 does not match the Ollama manifest. Received $modelHash."
}

Write-Host ''
Write-Host 'The local model is ready:'
Write-Host "  Runtime: $serverPath"
Write-Host "  Model:   $modelPath"
Write-Host "  SHA256:  $modelHash"
Write-Host 'Run .\scripts\start.ps1 to open Angela.'
