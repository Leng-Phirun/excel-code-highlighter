# Installs Code Highlighter for Excel on Windows. Run it in PowerShell:
#
#   irm https://leng-phirun.github.io/excel-code-highlighter/install.ps1 | iex
#
# What it does:
#   1. Downloads the add-in's manifest to %USERPROFILE%\CodeHighlighter and checks it is
#      Code Highlighter's and points only at the add-in's own site. (Not AppData: packaged
#      apps redirect AppData writes, so a share there could point at nothing.)
#   2. Shares that folder as \\localhost\CodeHighlighter, readable only by you. Excel only
#      accepts add-in catalogs on a network share, and creating one needs administrator
#      permission, so Windows asks once. Only that one command runs as administrator.
#   3. Adds the share to Excel's trusted add-in catalogs (File > Options > Trust Center).
# You then add Code Highlighter once in Excel, and it stays on the Home tab.
#
# Without administrator permission it registers the add-in for you as a developer add-in
# instead; then you choose it under Home > Add-ins each time Excel starts.
#
# The build replaces https://localhost:3000/ with the address the add-in is hosted at.
# Keep this file ASCII: "irm | iex" may decode it as Latin-1.

& {
  $ErrorActionPreference = "Stop"
  $ProgressPreference = "SilentlyContinue"
  $site = "https://localhost:3000/"
  $addinId = "61510d37-86c6-4098-95c3-ee4c889899c1"
  $shareName = "CodeHighlighter"
  $catalogUrl = "\\localhost\$shareName"
  $folder = Join-Path $env:USERPROFILE "CodeHighlighter"
  $manifest = Join-Path $folder "manifest.xml"
  $download = "$manifest.download"
  $ownFiles = @("manifest.xml", "manifest.xml.download", "README.txt")
  $wef = "HKCU:\Software\Microsoft\Office\16.0\WEF"

  function Step($text) { Write-Host "  $text" }

  # Runs $script as administrator. Values travel base64-encoded, so no path or account name
  # can change the script, and PowerShell is started by full path, not looked up.
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
      return -1   # permission refused, or not an administrator
    }
  }

  function Assert-Manifest([string]$path) {
    $settings = New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $reader = [System.Xml.XmlReader]::Create($path, $settings)
    try { $doc = New-Object System.Xml.XmlDocument; $doc.Load($reader) } finally { $reader.Close() }
    $urls = @([regex]::Matches($doc.OuterXml, 'https://[^"<\s]+') | ForEach-Object { $_.Value })
    $foreign = @($urls | Where-Object { -not $_.StartsWith($site) })
    if ($doc.OfficeApp.Id -ne $addinId -or $urls.Count -eq 0 -or $foreign.Count -gt 0) {
      throw "The file downloaded from $site isn't the expected Code Highlighter manifest."
    }
  }

  try {
    Write-Host ""
    Write-Host "Installing Code Highlighter for Excel"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    # Never share a folder of yours that happens to have this name.
    if (Test-Path $folder) {
      $other = @(Get-ChildItem -Force $folder | Where-Object { $ownFiles -notcontains $_.Name })
      if ($other.Count -gt 0) {
        throw "$folder already exists and holds other files, so it won't be shared. Move or rename it, then run the installer again."
      }
    }
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri ($site + "manifest.xml") -OutFile $download
    try { Assert-Manifest $download } catch { Remove-Item $download -ErrorAction SilentlyContinue; throw }
    Move-Item $download $manifest -Force
    Set-Content -Path (Join-Path $folder "README.txt") -Encoding ASCII -Value @(
      "This folder holds the manifest of the Code Highlighter add-in for Excel.",
      "Excel reads it through the $catalogUrl share. To remove the add-in, run this in PowerShell:",
      "",
      "  irm ${site}uninstall.ps1 | iex"
    )
    Step "Downloaded the manifest to $folder"

    $shared = Test-Path (Join-Path $catalogUrl "manifest.xml")
    if (-not $shared) {
      Step "Sharing the folder (Windows asks for permission)..."
      $code = Invoke-Elevated -values @{
        Name = $shareName; Path = $folder; User = [Security.Principal.WindowsIdentity]::GetCurrent().Name
      } -script @'
$ErrorActionPreference = 'Stop'
$existing = Get-SmbShare -Name $Name -ErrorAction SilentlyContinue
if ($existing -and $existing.Path -ne $Path) { exit 2 }
if ($existing) { Remove-SmbShare -Name $Name -Force }
New-SmbShare -Name $Name -Path $Path -ReadAccess $User -FolderEnumerationMode AccessBased `
  -Description 'Code Highlighter add-in catalog for Excel' | Out-Null
'@
      if ($code -eq 2) {
        throw "A different folder is already shared as $catalogUrl; the installer leaves it alone. Use the manual steps instead."
      }
      $shared = $code -eq 0 -and (Test-Path (Join-Path $catalogUrl "manifest.xml"))
      if ($shared) { Step "Shared it as $catalogUrl, readable only by you" }
    }

    if ($shared) {
      $catalogs = "$wef\TrustedCatalogs"
      $existing = Get-ChildItem $catalogs -ErrorAction SilentlyContinue |
        Where-Object { (Get-ItemProperty $_.PSPath).Url -eq $catalogUrl }
      if (-not $existing) {
        $id = "{" + [guid]::NewGuid().ToString() + "}"
        $key = New-Item -Path "$catalogs\$id" -Force
        New-ItemProperty -Path $key.PSPath -Name Id -Value $id -PropertyType String | Out-Null
        New-ItemProperty -Path $key.PSPath -Name Url -Value $catalogUrl -PropertyType String | Out-Null
        New-ItemProperty -Path $key.PSPath -Name Flags -Value 1 -PropertyType DWord | Out-Null
      }
      Step "Added it to Excel's trusted add-in catalogs"
      Remove-ItemProperty -Path "$wef\Developer" -Name $addinId -ErrorAction SilentlyContinue
      $next = @(
        "In Excel, choose Home > Add-ins > Advanced (or More Add-ins), open the",
        "SHARED FOLDER tab, select Code Highlighter and choose Add. You only do this once."
      )
    } else {
      Step "No administrator permission, so registering it as a developer add-in instead"
      New-Item -Path "$wef\Developer" -Force | Out-Null
      New-ItemProperty -Path "$wef\Developer" -Name $addinId -Value $manifest -PropertyType String -Force | Out-Null
      $next = @(
        "In Excel, choose Home > Add-ins and select Code Highlighter under Developer Add-ins.",
        "Excel forgets developer add-ins when it closes, so do this each time you start Excel.",
        "Run the installer again and allow the permission prompt to install it permanently."
      )
    }

    Write-Host ""
    Write-Host "Done. Next step:" -ForegroundColor Green
    if (Get-Process EXCEL -ErrorAction SilentlyContinue) {
      Write-Host "  Close Excel completely and open it again, then:"
    }
    $next | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    Write-Host "  Help: ${site}support.html"
    Write-Host ""
  } catch {
    Write-Host ""
    Write-Host "Code Highlighter was not installed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Manual steps: ${site}support.html"
    Write-Host ""
  }
}
