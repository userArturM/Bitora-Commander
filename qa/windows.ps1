param([string]$Executable, [string]$AppArguments = '--functional-test', [string]$Label = 'app')
$ErrorActionPreference = 'Stop'
$env:BITORA_TEST_REPORT = Join-Path $env:RUNNER_TEMP "$Label-report.json"
Remove-Item $env:BITORA_TEST_REPORT -ErrorAction SilentlyContinue
$p = Start-Process -FilePath $Executable -ArgumentList $AppArguments -PassThru
if (!$p.WaitForExit(120000)) { $p.Kill(); throw "$Label timed out" }
if (!(Test-Path $env:BITORA_TEST_REPORT)) { throw "$Label produced no report; exit $($p.ExitCode)" }
Get-Content $env:BITORA_TEST_REPORT
$r = Get-Content $env:BITORA_TEST_REPORT -Raw | ConvertFrom-Json
if (!$r.passed -or $p.ExitCode -ne 0) { throw "$Label failed" }
