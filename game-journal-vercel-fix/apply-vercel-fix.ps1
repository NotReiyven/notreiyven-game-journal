$ErrorActionPreference = "Stop"

# Run this script from the Git repository root.
$candidates = @(
    (Join-Path (Get-Location) "notreiyven-game-journal/src/App.tsx"),
    (Join-Path (Get-Location) "src/App.tsx")
)

$appPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appPath) {
    throw "Could not find src/App.tsx. Run this script from the repository root."
}

$content = Get-Content -Raw $appPath
$oldImport = 'import { api, ApiError } from "./lib/api";'
$newImport = 'import { api } from "./lib/api";'

if ($content.Contains($oldImport)) {
    $content = $content.Replace($oldImport, $newImport)
    Set-Content -Path $appPath -Value $content -NoNewline
    Write-Host "Removed unused ApiError import from $appPath"
} elseif ($content.Contains($newImport)) {
    Write-Host "ApiError import is already fixed."
} else {
    throw "Expected API import line was not found in App.tsx. No changes were made to that file."
}

$srcDir = Split-Path $appPath -Parent
$typesPath = Join-Path $srcDir "vite-env.d.ts"
$typesContent = '/// <reference types="vite/client" />' + "`n"

if (-not (Test-Path $typesPath)) {
    Set-Content -Path $typesPath -Value $typesContent -NoNewline
    Write-Host "Created $typesPath"
} else {
    $existing = Get-Content -Raw $typesPath
    if (-not $existing.Contains('/// <reference types="vite/client" />')) {
        Add-Content -Path $typesPath -Value $typesContent
        Write-Host "Added Vite client types to $typesPath"
    } else {
        Write-Host "Vite client types are already present."
    }
}

Write-Host ""
Write-Host "Fix applied. Next run:"
Write-Host "git add ."
Write-Host 'git commit -m "Fix Vercel TypeScript build"'
Write-Host "git push"
