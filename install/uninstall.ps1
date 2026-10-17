# Removes Code Highlighter for Excel from Windows. Run it in PowerShell:
#
#   irm https://leng-phirun.github.io/excel-code-highlighter/uninstall.ps1 | iex
#
# Undoes install.ps1: removes the trusted catalog entry, the developer registration, the
# \\localhost\CodeHighlighter share (Windows asks for permission) and the downloaded manifest.
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
  $wef = "HKCU:\Software\Microsoft\Office\16.0\WEF"

  function Step($text) { Write-Host "  $text" }

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
      $command = "Get-SmbShare -Name '$shareName' -ErrorAction SilentlyContinue | Remove-SmbShare -Force"
      $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
      try {
        Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait `
          -ArgumentList "-NoProfile -NonInteractive -EncodedCommand $encoded"
      } catch { }
      if (Test-Path $catalogUrl) {
        Step "The share $catalogUrl is still there; remove it later in Computer Management > Shared Folders."
      } else {
        Step "Removed the share $catalogUrl"
      }
    }

    if (Test-Path $folder) {
      Remove-Item $folder -Recurse -Force
      Step "Deleted $folder"
    }

    Write-Host ""
    Write-Host "Done. Close Excel completely and open it again." -ForegroundColor Green
    Write-Host "  If the Code buttons are still on the Home tab, choose Home > Add-ins > Advanced,"
    Write-Host "  right-click Code Highlighter under My Add-ins and choose Remove."
    Write-Host ""
  } catch {
    Write-Host ""
    Write-Host "Code Highlighter was not fully removed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Help: ${site}support.html"
    Write-Host ""
  }
}
