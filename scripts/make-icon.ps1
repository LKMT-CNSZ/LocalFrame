$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
$target = Join-Path $assetDirectory 'icon.png'

$bitmap = [System.Drawing.Bitmap]::new(512, 512)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(11, 13, 16))

$lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(199, 255, 61))
$dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(11, 13, 16))
$graphics.FillRectangle($lime, 72, 72, 368, 368)
$graphics.FillPolygon($dark, @(
  [System.Drawing.Point]::new(72, 72),
  [System.Drawing.Point]::new(180, 72),
  [System.Drawing.Point]::new(72, 180)
))
$font = [System.Drawing.Font]::new('Arial', 235, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('L', $font, $dark, 178, 142)

$bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
$font.Dispose()
$lime.Dispose()
$dark.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
Write-Output $target
