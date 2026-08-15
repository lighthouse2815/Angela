[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
python -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
node --check angela\static\app.js
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
node --check angela\static\voice-core.js
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
node --test tests\js\voice-core.test.js
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
Write-Host 'Python tests and JavaScript syntax checks passed.'
