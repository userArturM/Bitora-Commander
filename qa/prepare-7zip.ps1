$ErrorActionPreference = 'Stop'
$headers = @{ Accept = 'application/vnd.github+json' }
if ($env:GH_TOKEN) { $headers.Authorization = "Bearer $env:GH_TOKEN" }
$release = Invoke-RestMethod 'https://api.github.com/repos/ip7z/7zip/releases/tags/26.05' -Headers $headers -MaximumRetryCount 3 -RetryIntervalSec 5
$asset = $release.assets | Where-Object name -eq '7z2605-x64.exe'
if (!$asset) { throw 'Official 7-Zip asset not found' }
$installer = Join-Path $env:RUNNER_TEMP '7z2605-x64.exe'
Invoke-WebRequest $asset.browser_download_url -OutFile $installer
if ($asset.digest -and $asset.digest.StartsWith('sha256:')) {
  if ((Get-FileHash $installer -Algorithm SHA256).Hash.ToLower() -ne $asset.digest.Substring(7)) { throw '7-Zip checksum mismatch' }
}
New-Item -ItemType Directory -Force tools/7zip | Out-Null
& "$env:ProgramFiles/7-Zip/7z.exe" x $installer '-otools/7zip' -y
if ($LASTEXITCODE -ne 0 -or !(Test-Path tools/7zip/7z.exe) -or !(Test-Path tools/7zip/7z.dll)) { throw '7-Zip extraction failed' }
