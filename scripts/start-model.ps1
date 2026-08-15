[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath = Join-Path $projectRoot 'tools\llama.cpp\llama-server.exe'
$modelPath = Join-Path $projectRoot 'models\Qwen3-4B-Instruct-2507-Q4_K_M.gguf'

if (-not (Test-Path -LiteralPath $serverPath) -or -not (Test-Path -LiteralPath $modelPath)) {
    throw 'The local model is not installed. Run .\scripts\setup-model.ps1 first.'
}

Write-Host 'Starting Qwen3 4B Instruct 2507 with Vulkan and a 4096-token context...'
& $serverPath `
    --model $modelPath `
    --ctx-size 4096 `
    --gpu-layers auto `
    --threads 6 `
    --parallel 1 `
    --cache-type-k q8_0 `
    --cache-type-v q8_0 `
    --reasoning off `
    --host 127.0.0.1 `
    --port 8080
