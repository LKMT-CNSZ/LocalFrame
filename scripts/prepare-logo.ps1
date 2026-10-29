$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot '..\assets\localframe-logo.png'
$iconTarget = Join-Path $PSScriptRoot '..\assets\localframe-logo-icon.png'
$rendererTarget = Join-Path $PSScriptRoot '..\src\renderer\localframe-logo.png'
$inputImage = [System.Drawing.Bitmap]::FromFile($source)
$outputImage = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($outputImage)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# The generated source is square with deliberate outer whitespace. This crop
# keeps an icon-safe margin while making the mark readable at small sizes.
$sourceRect = [System.Drawing.Rectangle]::new(127, 127, 1000, 1000)
$targetRect = [System.Drawing.Rectangle]::new(0, 0, 1024, 1024)
$graphics.DrawImage($inputImage, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
$outputImage.Save($iconTarget, [System.Drawing.Imaging.ImageFormat]::Png)
$outputImage.Save($rendererTarget, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$outputImage.Dispose()
$inputImage.Dispose()
Write-Output $iconTarget
