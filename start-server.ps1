# ============================================
#  Real-Time Audio Simulator - local server
#  Author : limlin
#  Built with Yuanbao (Yuanbao AI Assistant)
#  Note   : ASCII only, safe on any code page
# ============================================
# =========================================================================
#  start-server.ps1
#
#  Why this script exists:
#    Browsers only allow access to audio input devices inside a
#    "secure context".  Opening the HTML by double-click uses file://,
#    which is NOT a secure context, so the "Audio Input" feature would
#    be blocked (navigator.mediaDevices becomes undefined).
#    http://localhost IS treated as a secure context, so we serve the
#    file over a tiny local HTTP server.
#
#  Implementation notes:
#    - Uses .NET HttpListener, built into Windows. Nothing to install.
#    - No internet access, no system settings changed, no registry writes.
#    - The HTML file is located by wildcard, so the file name may be
#      anything (including non-ASCII names) without breaking anything.
#    - All console output is plain ASCII on purpose: mixing non-ASCII
#      with cmd.exe code pages (936/65001) is the usual cause of the
#      garbled text users report. Keep this file ASCII-only.
#
#  Usage:  double-click Start.bat  (do NOT run this .ps1 directly)
# =========================================================================
param(
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Locate the HTML by wildcard so the file name does not matter.
$htmlFile = Get-ChildItem -Path $here -Filter "*.html" -File |
            Select-Object -First 1

if (-not $htmlFile) {
    Write-Host ""
    Write-Host "  [ERROR] No .html file found in this folder."
    Write-Host "  Make sure Start.bat, start-server.ps1 and the HTML"
    Write-Host "  file are all in the SAME folder."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Find a free port (try Port .. Port+19)
$listener = $null
for ($i = 0; $i -lt 20; $i++) {
    $try = $Port + $i
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://localhost:$try/")
        $l.Start()
        $listener = $l
        $Port = $try
        break
    } catch {
        try { if ($l) { $l.Stop() } } catch {}
    }
}

if (-not $listener) {
    Write-Host ""
    Write-Host "  [ERROR] Could not start the local server."
    Write-Host "  Ports 8765-8784 are all in use."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$rootUrl = "http://localhost:$Port/"
$htmlBytes = [System.IO.File]::ReadAllBytes($htmlFile.FullName)

# Inline 1x1 transparent GIF, so the browser stops asking for /favicon.ico
$favicon = [Convert]::FromBase64String(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")

Write-Host ""
Write-Host "  =================================================="
Write-Host "    Real-time Audio Simulator"
Write-Host "  =================================================="
Write-Host ""
Write-Host "  Server running at : $rootUrl"
Write-Host "  Serving file      : $($htmlFile.Name)"
Write-Host ""
Write-Host "  Opening your browser now..."
Write-Host ""
Write-Host "  ---- Quick start --------------------------------"
Write-Host "    1. Play a song in QQ Music / NetEase Cloud"
Write-Host "    2. Click  [Start Audio Engine]  on the page"
Write-Host "    3. Right panel -> [Audio Input]"
Write-Host "       pick a device -> click [Start Capture]"
Write-Host "    4. To avoid hearing the original sound twice,"
Write-Host "       use VB-CABLE (see the manual for details)"
Write-Host "  -------------------------------------------------"
Write-Host ""
Write-Host "  Close this window to stop the server."
Write-Host ""

# Open the browser BEFORE entering the serving loop (GetContext blocks).
Start-Process $rootUrl

try {
    while ($listener.IsListening) {
        $ctx = $null
        try {
            $ctx = $listener.GetContext()
        } catch {
            break
        }

        $req = $ctx.Request
        $res = $ctx.Response
        $url = $req.Url.AbsolutePath

        try {
            if ($url -like "*favicon*") {
                $body = $favicon
                $res.ContentType = "image/gif"
            } else {
                # Single-file app: every other request just returns the page.
                $body = $htmlBytes
                $res.ContentType = "text/html; charset=utf-8"
            }

            $res.StatusCode = 200
            $res.ContentLength64 = $body.Length
            $res.OutputStream.Write($body, 0, $body.Length)
        } catch {
            try { $res.StatusCode = 500 } catch {}
        }
        finally {
            try { $res.OutputStream.Close() } catch {}
        }
    }
}
finally {
    try { $listener.Stop() } catch {}
    try { $listener.Close() } catch {}
}
