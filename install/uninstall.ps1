# Removes Code Highlighter for Excel from Windows. Run it in PowerShell:
#
#   irm https://leng-phirun.github.io/excel-code-highlighter/uninstall.ps1 | iex
#
# Undoes install.ps1: removes the trusted catalog entry, the developer registration, the
# \\localhost\CodeHighlighter share (Windows asks for permission) and the files the
# installer created. It touches the share only if it points at the installer's folder, and
# deletes the folder only if nothing else is in it.
#
# The build replaces https://localhost:3000/ with the address the add-in is hosted at.
# Keep this file ASCII: "irm | iex" may decode it as Latin-1.

& {
  $ErrorActionPreference = "Stop"
  $site = "https://localhost:3000/"
  $addinId = "61510d37-86c6-4098-95c3-ee4c889899c1"
  $shareName = "CodeHighlighter"
  $catalogUrl = "\\localhost\$shareName"
  $folder = Join-Path $env:USERPROFILE "CodeHighlighter"
  $ownFiles = @("manifest.xml", "manifest.xml.download", "README.txt")
  $wef = "HKCU:\Software\Microsoft\Office\16.0\WEF"

  function Step($text) { Write-Host "  $text" }

  # Runs $script as administrator. Values travel base64-encoded, so no path can change the
  # script, and PowerShell is started by full path, not looked up.
  function Invoke-Elevated([string]$script, [hashtable]$values) {
    $prelude = foreach ($v in $values.GetEnumerator()) {
      $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$v.Value))
      "`$$($v.Key) = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$b64'))"
    }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((@($prelude) + $script) -join "`n"))
    $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    try {
      $p = Start-Process $powershell -Verb RunAs -WindowStyle Hidden -Wait -PassThru `
        -ArgumentList "-NoProfile -NonInteractive -EncodedCommand $encoded"
      return $p.ExitCode
    } catch {
      return -1
    }
  }

  try {
    Write-Host ""
    Write-Host "Removing Code Highlighter for Excel"

    Get-ChildItem "$wef\TrustedCatalogs" -ErrorAction SilentlyContinue |
      Where-Object { (Get-ItemProperty $_.PSPath).Url -eq $catalogUrl } |
      ForEach-Object { Remove-Item $_.PSPath -Recurse; Step "Removed the trusted catalog entry" }

    if ((Get-ItemProperty "$wef\Developer" -ErrorAction SilentlyContinue).$addinId) {
      Remove-ItemProperty -Path "$wef\Developer" -Name $addinId
      Step "Removed the developer registration"
    }

    if (Test-Path $catalogUrl) {
      Step "Removing the shared folder (Windows asks for permission)..."
      $code = Invoke-Elevated -values @{ Name = $shareName; Path = $folder } -script @'
$existing = Get-SmbShare -Name $Name -ErrorAction SilentlyContinue
if ($existing -and $existing.Path -ne $Path) { exit 2 }
if ($existing) { Remove-SmbShare -Name $Name -Force }
'@
      if ($code -eq 2) {
        Step "$catalogUrl shares a different folder, not the installer's, so it was left alone."
      } elseif (Test-Path $catalogUrl) {
        Step "The share $catalogUrl is still there; remove it later in Computer Management > Shared Folders."
      } else {
        Step "Removed the share $catalogUrl"
      }
    }

    if (Test-Path $folder) {
      foreach ($name in $ownFiles) { Remove-Item (Join-Path $folder $name) -Force -ErrorAction SilentlyContinue }
      if (@(Get-ChildItem -Force $folder).Count -eq 0) {
        Remove-Item $folder -Force
        Step "Deleted $folder"
      } else {
        Step "Removed the installer's files; $folder holds other files, so it was kept."
      }
    }

    Write-Host ""
    Write-Host "Done. Close Excel completely and open it again; the Code buttons will be gone." -ForegroundColor Green
    Write-Host ""
  } catch {
    Write-Host ""
    Write-Host "Code Highlighter was not fully removed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Help: ${site}support.html"
    Write-Host ""
  }
}
