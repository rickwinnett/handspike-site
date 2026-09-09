# ==================================================================================================
# deploy.ps1 — stand up the handspike.dev visitor counter, or update it
# ==================================================================================================
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File _counter\deploy.ps1
#
# Safe to run again. It creates nothing twice, and it will NOT rotate the salt on a re-run — rotating
# it would change every future hash, so every returning visitor would be counted as a new one and the
# number would silently restart. If the salt ever genuinely has to change, delete the D1 database in
# the same breath, because the count it holds becomes meaningless the moment the salt moves.
#
# The one thing this script cannot do for you is log in. `wrangler login` opens a browser for OAuth.
# ==================================================================================================

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$DB_NAME  = 'handspike-visitors'
$WORKER   = 'handspike-visitors'
$SITE_JS  = Join-Path (Split-Path -Parent $here) 'visitors.js'

function Say($m) { Write-Host "  $m" }
function Head($m) { Write-Host ""; Write-Host "== $m" -ForegroundColor Cyan }

# ---- 1. authentication -------------------------------------------------------------------------
Head "Cloudflare account"
$who = (npx --yes wrangler whoami 2>&1 | Out-String)
if ($who -match 'not authenticated') {
  Write-Host ""
  Write-Host "  Not logged in to Cloudflare. Run this yourself first (it opens a browser):" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "      npx wrangler login" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  then run this script again."
  exit 1
}
Say "authenticated."

# ---- 2. the database ---------------------------------------------------------------------------
Head "D1 database '$DB_NAME'"
$dbId = $null
$listRaw = (npx --yes wrangler d1 list --json 2>$null | Out-String)
if ($listRaw.Trim().StartsWith('[')) {
  try {
    $existing = $listRaw | ConvertFrom-Json
    foreach ($d in $existing) { if ($d.name -eq $DB_NAME) { $dbId = $d.uuid } }
  } catch { $dbId = $null }
}

if ($dbId) {
  Say "already exists ($dbId)."
} else {
  Say "creating..."
  $created = (npx --yes wrangler d1 create $DB_NAME 2>&1 | Out-String)
  $m = [regex]::Match($created, 'database_id\s*=\s*"([0-9a-fA-F-]{36})"')
  if (-not $m.Success) { $m = [regex]::Match($created, '"uuid"\s*:\s*"([0-9a-fA-F-]{36})"') }
  if (-not $m.Success) {
    Write-Host $created
    throw "Could not read the new database_id out of wrangler's output. Copy it into wrangler.toml by hand and re-run."
  }
  $dbId = $m.Groups[1].Value
  Say "created ($dbId)."
}

# ---- 3. bind it --------------------------------------------------------------------------------
$tomlPath = Join-Path $here 'wrangler.toml'
$toml = Get-Content $tomlPath -Raw
$tomlNew = [regex]::Replace($toml, 'database_id\s*=\s*"[^"]*"', ('database_id = "' + $dbId + '"'))
if ($tomlNew -ne $toml) {
  Set-Content -Path $tomlPath -Value $tomlNew -Encoding utf8 -NoNewline
  Say "wrangler.toml bound to $dbId."
}

# ---- 4. schema ---------------------------------------------------------------------------------
Head "Schema"
npx --yes wrangler d1 execute $DB_NAME --remote --file=schema.sql --yes
if ($LASTEXITCODE -ne 0) { throw "schema apply failed" }
Say "applied (CREATE TABLE IF NOT EXISTS — existing rows untouched)."

# ---- 5. deploy ---------------------------------------------------------------------------------
Head "Deploy"
$out = (npx --yes wrangler deploy 2>&1 | Out-String)
Write-Host $out
if ($LASTEXITCODE -ne 0) { throw "deploy failed" }
$um = [regex]::Match($out, 'https://[a-z0-9.-]+\.workers\.dev')
if (-not $um.Success) { throw "Deployed, but could not find the worker URL in the output. Set ENDPOINT in visitors.js by hand." }
$url = $um.Value + '/hit'
Say "live at $url"

# ---- 6. the salt, once and only once -----------------------------------------------------------
Head "Salt"
$secrets = (npx --yes wrangler secret list 2>&1 | Out-String)
if ($secrets -match 'VISITOR_SALT') {
  Say "VISITOR_SALT already set — left alone on purpose (rotating it would reset the count)."
} else {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $salt = [System.Convert]::ToBase64String($bytes)
  $salt | npx --yes wrangler secret put VISITOR_SALT
  if ($LASTEXITCODE -ne 0) { throw "could not set VISITOR_SALT" }
  Say "generated and stored (32 random bytes; it exists only on Cloudflare from here)."
}

# ---- 7. point the page at it -------------------------------------------------------------------
Head "Wiring the page"
if (-not (Test-Path $SITE_JS)) { throw "visitors.js not found at $SITE_JS" }
$js = Get-Content $SITE_JS -Raw
$jsNew = [regex]::Replace($js, "var ENDPOINT = '[^']*';", ("var ENDPOINT = '" + $url + "';"))
if ($jsNew -eq $js) {
  Say "visitors.js already points at this endpoint."
} else {
  Set-Content -Path $SITE_JS -Value $jsNew -Encoding utf8 -NoNewline
  Say "visitors.js ENDPOINT set."
}

Write-Host ""
Write-Host "  DONE. The counter is live but the page does not know it yet." -ForegroundColor Green
Write-Host ""
Write-Host "      git -C `"$(Split-Path -Parent $here)`" add visitors.js _counter"
Write-Host "      git -C `"$(Split-Path -Parent $here)`" commit -m `"site: visitor counter endpoint`""
Write-Host "      git -C `"$(Split-Path -Parent $here)`" push"
Write-Host ""
Write-Host "  Until that push lands, the footer stays blank — which is the correct thing for it to do."
Write-Host ""
