Set-Location -LiteralPath $PSScriptRoot
node (Join-Path $PSScriptRoot "server\index.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
