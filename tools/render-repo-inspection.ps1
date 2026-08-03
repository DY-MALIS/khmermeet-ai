param(
  [string]$OutputPath = "C:\tmp\khmermeet-repo-inspection.png"
)

Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$sections = [System.Collections.Generic.List[string]]::new()

function Add-Section {
  param(
    [string]$Title,
    [string[]]$Lines
  )

  $sections.Add("===== $Title =====")
  foreach ($line in $Lines) {
    $sections.Add($line)
  }
  $sections.Add("")
}

Add-Section "GIT STATUS" @(git status --short 2>&1)
Add-Section "PACKAGE.JSON" @(Get-Content -LiteralPath (Join-Path $root "package.json") -ErrorAction SilentlyContinue)

$hostingPath = Join-Path $root ".openai\hosting.json"
if (Test-Path -LiteralPath $hostingPath) {
  Add-Section ".OPENAI/HOSTING.JSON" @(Get-Content -LiteralPath $hostingPath)
} else {
  Add-Section ".OPENAI/HOSTING.JSON" @("(not present)")
}

Add-Section "EXPORT SEARCH" @(rg -n --glob "*.tsx" --glob "*.ts" "Export text|export text|Meeting detail|meeting detail" app components lib 2>&1)
Add-Section "MEETING FILES" @(rg --files app components lib 2>&1 | rg "meeting|export|detail" 2>&1)

$font = New-Object System.Drawing.Font("Consolas", 15)
$headerFont = New-Object System.Drawing.Font("Consolas", 18, [System.Drawing.FontStyle]::Bold)
$lineHeight = 24
$width = 1900
$maxChars = 150
$renderLines = [System.Collections.Generic.List[string]]::new()

foreach ($line in $sections) {
  if ($line.Length -le $maxChars) {
    $renderLines.Add($line)
    continue
  }

  for ($index = 0; $index -lt $line.Length; $index += $maxChars) {
    $length = [Math]::Min($maxChars, $line.Length - $index)
    $renderLines.Add($line.Substring($index, $length))
  }
}

$height = [Math]::Max(800, (($renderLines.Count + 2) * $lineHeight) + 40)
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$y = 20
foreach ($line in $renderLines) {
  $currentFont = if ($line.StartsWith("=====")) { $headerFont } else { $font }
  $brush = if ($line.StartsWith("=====")) {
    [System.Drawing.Brushes]::DarkGreen
  } else {
    [System.Drawing.Brushes]::Black
  }
  $graphics.DrawString($line, $currentFont, $brush, 20, $y)
  $y += $lineHeight
}

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}

$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
$headerFont.Dispose()
