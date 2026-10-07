$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'extension/manifest.json') -Raw | ConvertFrom-Json
$taskArtifacts = Join-Path $taskRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $taskArtifacts | Out-Null
$taskZip = Join-Path $taskArtifacts ("ok-online-judge-v" + $taskManifest.version + '.zip')
Compress-Archive -LiteralPath (Join-Path $taskRoot 'extension'), (Join-Path $taskRoot 'README.md') -DestinationPath $taskZip -Force
Get-Item -LiteralPath $taskZip | Select-Object FullName, Length
