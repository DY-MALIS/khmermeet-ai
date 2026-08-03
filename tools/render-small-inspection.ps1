param(
  [Parameter(Mandatory = $true)]
  [string]$Mode,
  [string]$Path = "",
  [int]$Start = 1,
  [int]$Count = 35,
  [string]$Output = "C:\tmp\khmermeet-inspection.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if ($Mode -eq "search") {
  $lines = @(
    rg -n --glob "*.tsx" --glob "*.ts" "Export text|Regenerate summary|Meeting detail" app components lib |
      Select-Object -First $Count
  )
} elseif ($Mode -eq "files") {
  $lines = @(
    rg --files app components lib |
      Where-Object { $_ -match "meeting|export" } |
      Select-Object -First $Count
  )
} elseif ($Mode -eq "package") {
  $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
  $lines = @(
    "dependencies:"
    $package.dependencies.PSObject.Properties | ForEach-Object { "$($_.Name): $($_.Value)" }
    "devDependencies:"
    $package.devDependencies.PSObject.Properties | ForEach-Object { "$($_.Name): $($_.Value)" }
  ) | Select-Object -First $Count
} else {
  $all = Get-Content -LiteralPath $Path
  $last = [Math]::Min($all.Count, $Start + $Count - 1)
  $lines = for ($line = $Start; $line -le $last; $line++) {
    "{0,4}: {1}" -f $line, $all[$line - 1]
  }
}

$width = 1500
$height = [Math]::Max(180, 42 + ($lines.Count * 24))
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font("Consolas", 12)
$brush = [System.Drawing.Brushes]::Black

$y = 14
foreach ($line in $lines) {
  $graphics.DrawString([string]$line, $font, $brush, 12, $y)
  $y += 24
}

$directory = Split-Path -Parent $Output
if (-not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}
$bitmap.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
