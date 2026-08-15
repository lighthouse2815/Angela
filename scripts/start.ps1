[CmdletBinding()]
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$modelScript = Join-Path $PSScriptRoot 'start-model.ps1'
$modelPath = Join-Path $projectRoot 'models\Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
$serverPath = Join-Path $projectRoot 'tools\llama.cpp\llama-server.exe'
$dotenvPath = Join-Path $projectRoot '.env'

function Get-AngelaSetting {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$DefaultValue
    )

    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue.Trim()
    }

    if (Test-Path -LiteralPath $dotenvPath) {
        foreach ($rawLine in Get-Content -LiteralPath $dotenvPath -Encoding UTF8) {
            $line = $rawLine.Trim()
            if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
                continue
            }

            $parts = $line -split '=', 2
            if ($parts[0].Trim() -ine $Name) {
                continue
            }

            $value = $parts[1].Trim()
            if ($value.Length -ge 2) {
                $doubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
                $singleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
                if ($doubleQuoted -or $singleQuoted) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
            break
        }
    }

    return $DefaultValue
}

$llmBaseUrl = Get-AngelaSetting `
    -Name 'ANGELA_LLM_BASE_URL' `
    -DefaultValue 'http://127.0.0.1:8080/v1'
$llmModel = Get-AngelaSetting `
    -Name 'ANGELA_LLM_MODEL' `
    -DefaultValue 'qwen3-4b-instruct-2507'
$endpointKey = $llmBaseUrl.Trim().TrimEnd('/').ToLowerInvariant()
$usesBundledModel = @(
    'http://127.0.0.1:8080/v1',
    'http://localhost:8080/v1'
) -contains $endpointKey

if ($usesBundledModel) {
    if (-not (Test-Path -LiteralPath $serverPath) -or -not (Test-Path -LiteralPath $modelPath)) {
        Write-Host 'The local model is not installed.' -ForegroundColor Yellow
        Write-Host 'Run: .\scripts\setup-model.ps1'
        exit 1
    }

    $modelOnline = $false
    $modelHealthUrl = "$($llmBaseUrl.TrimEnd('/'))/models"
    try {
        $null = Invoke-RestMethod -Uri $modelHealthUrl -TimeoutSec 2
        $modelOnline = $true
    }
    catch {
        $modelOnline = $false
    }

    if (-not $modelOnline) {
        Write-Host 'Starting the local model in the background...'
        Start-Process `
            -FilePath 'powershell.exe' `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$modelScript`"") `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden

        $deadline = (Get-Date).AddMinutes(3)
        do {
            Start-Sleep -Seconds 2
            try {
                $null = Invoke-RestMethod -Uri $modelHealthUrl -TimeoutSec 2
                $modelOnline = $true
            }
            catch {
                $modelOnline = $false
            }
        } while (-not $modelOnline -and (Get-Date) -lt $deadline)

        if (-not $modelOnline) {
            throw 'The model did not start within 3 minutes. Run .\scripts\start-model.ps1 to inspect its log.'
        }
    }
}
else {
    Write-Host 'Using the configured OpenAI-compatible endpoint; the bundled model will not be started.'
}

$env:ANGELA_LLM_BASE_URL = $llmBaseUrl
$env:ANGELA_LLM_MODEL = $llmModel
Set-Location -LiteralPath $projectRoot

$arguments = @('-m', 'angela.server')
if (-not $NoBrowser) {
    $arguments += '--open'
}
& python @arguments
