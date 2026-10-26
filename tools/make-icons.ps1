# Regenerates the PWA icon set (PNG) using System.Drawing — no deps needed on Windows.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Make-Icon([int]$size, [string]$path, [double]$contentScale) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    function P([double]$x, [double]$y) {
        New-Object System.Drawing.PointF (($x * $size), ($y * $size))
    }

    # sky gradient: deep blue top -> warm horizon
    $rect = New-Object System.Drawing.Rectangle (0, 0, $size, $size)
    $top = [System.Drawing.Color]::FromArgb(255, 12, 27, 58)
    $bot = [System.Drawing.Color]::FromArgb(255, 247, 150, 96)
    $sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, $top, $bot, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($sky, $rect)

    # sun
    $sunR = $size * 0.09
    $sun = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 238, 176))
    $g.FillEllipse($sun, [float]($size * 0.74 - $sunR), [float]($size * 0.62 - $sunR), [float]($sunR * 2), [float]($sunR * 2))

    # mountain ranges
    $far = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 40, 56, 92))
    $farPts = [System.Drawing.PointF[]]@(
        (P 0.00 1.02), (P 0.16 0.72), (P 0.32 0.90), (P 0.50 0.62),
        (P 0.70 0.88), (P 0.86 0.70), (P 1.02 0.84), (P 1.02 1.02)
    )
    $g.FillPolygon($far, $farPts)

    $near = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 18, 28, 52))
    $nearPts = [System.Drawing.PointF[]]@(
        (P -0.02 1.02), (P 0.22 0.82), (P 0.44 0.98), (P 0.62 0.78),
        (P 0.82 0.96), (P 1.02 0.80), (P 1.02 1.04)
    )
    $g.FillPolygon($near, $nearPts)

    # glider delta wing, white
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $c = 0.50; $s = $contentScale
    $glider = [System.Drawing.PointF[]]@(
        (P ($c - 0.30 * $s) ($c + 0.10 * $s)),
        (P ($c + 0.30 * $s) ($c + 0.10 * $s)),
        (P ($c + 0.05 * $s) ($c + 0.02 * $s)),
        (P $c ($c - 0.28 * $s)),
        (P ($c - 0.05 * $s) ($c + 0.02 * $s))
    )
    $g.FillPolygon($white, $glider)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "wrote $path"
}

Make-Icon 192  (Join-Path $dir "icon-192.png") 1.0
Make-Icon 512  (Join-Path $dir "icon-512.png") 1.0
Make-Icon 512  (Join-Path $dir "maskable-512.png") 0.62
Make-Icon 180  (Join-Path $dir "apple-touch-icon.png") 0.95
