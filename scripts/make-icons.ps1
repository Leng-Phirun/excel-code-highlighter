# Renders the add-in and ribbon icons into assets/ (run: npm run icons).
# Drawings use a 100x100 grid that is scaled to each output size.
Add-Type -AssemblyName System.Drawing

$assets = Join-Path $PSScriptRoot "..\assets"
New-Item -ItemType Directory -Force $assets | Out-Null

function New-Color([string]$hex) {
  [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $path
}

function Add-Bar($g, [float]$x, [float]$y, [float]$w, [float]$h, [string]$hex) {
  $brush = New-Object System.Drawing.SolidBrush (New-Color $hex)
  $g.FillPath($brush, (New-RoundedRect $x $y $w $h ($h / 2)))
  $brush.Dispose()
}

# Three lines of "code" in syntax colours: the add-in's mark.
function Add-CodeLines($g, [string[]]$colors) {
  Add-Bar $g 18 25 26 11 $colors[0]
  Add-Bar $g 49 25 33 11 $colors[1]
  Add-Bar $g 30 45 22 11 $colors[2]
  Add-Bar $g 57 45 25 11 $colors[3]
  Add-Bar $g 30 65 40 11 $colors[4]
}

$syntax = @("#C586C0", "#DCDCAA", "#9CDCFE", "#CE9178", "#4EC9B0")

$drawings = @{
  icon = {
    param($g)
    $bg = New-Object System.Drawing.SolidBrush (New-Color "#1E1E1E")
    $g.FillPath($bg, (New-RoundedRect 0 0 100 100 20))
    Add-CodeLines $g $syntax
  }
  highlight = {
    param($g)
    $bg = New-Object System.Drawing.SolidBrush (New-Color "#1E1E1E")
    $g.FillPath($bg, (New-RoundedRect 4 4 92 92 16))
    Add-CodeLines $g $syntax
  }
  clear = {
    param($g)
    Add-CodeLines $g @("#A19F9D", "#A19F9D", "#A19F9D", "#A19F9D", "#A19F9D")
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillEllipse($white, 50, 50, 46, 46)
    $pen = New-Object System.Drawing.Pen ((New-Color "#C50F1F"), 8)
    $g.DrawEllipse($pen, 55, 55, 36, 36)
    $g.DrawLine($pen, 61, 85, 85, 61)
  }
  settings = {
    param($g)
    $line = New-Object System.Drawing.Pen ((New-Color "#616161"), 8)
    $line.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $knobFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $knobPen = New-Object System.Drawing.Pen ((New-Color "#0F6CBD"), 8)
    foreach ($s in @(@(22, 36), @(50, 66), @(78, 44))) {
      $y = $s[0]; $x = $s[1]
      $g.DrawLine($line, 12, $y, 88, $y)
      $g.FillEllipse($knobFill, $x - 11, $y - 11, 22, 22)
      $g.DrawEllipse($knobPen, $x - 9, $y - 9, 18, 18)
    }
  }
}

function Save-Icon([string]$name, [int]$size, [scriptblock]$draw) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform($size / 100.0, $size / 100.0)
  & $draw $g
  $file = Join-Path $assets "$name-$size.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output "wrote $file"
}

foreach ($size in 16, 32, 64, 80, 128, 300) { Save-Icon "icon" $size $drawings.icon }
foreach ($name in "highlight", "clear", "settings") {
  foreach ($size in 16, 32, 80) { Save-Icon $name $size $drawings[$name] }
}
