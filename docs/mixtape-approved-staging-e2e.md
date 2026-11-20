# Mixtape approved staging E2E

Local-only Playwright checks for Mixtapes on staging dev (`http://localhost:3003` for the recovered repo).

## Dedicated staging artist (optional)

Provision or refresh the standard E2E artist (staging only, no production):

```bash
node scripts/provision-mixtape-e2e-staging-artist.mjs
```

Account identifier: `mdb-mixtape-e2e-artist@mdb-staging.invalid` (credentials written locally to `tmp-mixtape-approved-e2e/staging-artist-credentials.env` — never commit).

## Environment variables

Set in your shell (do not commit):

| Variable | Required | Purpose |
|----------|----------|---------|
| `MDB_MIXTAPE_E2E_BASE_URL` | No | Default `http://localhost:3002` (use `http://localhost:3003` on recovered repo) |
| `MDB_MIXTAPE_E2E_EMAIL` | Full run | Beta-approved staging account email |
| `MDB_MIXTAPE_E2E_PASSWORD` | Full run | Password for that account |
| `MDB_MIXTAPE_E2E_EXPECTED_PROJECT_REF` | No | Default `jzlegcbotqfzevtczwhx` |

Identity guard reads `NEXT_PUBLIC_SUPABASE_URL` from `.env.staging.local` only (no secrets printed).

## Commands

```bash
node scripts/verify-mixtape-approved-staging-e2e.mjs --preflight
```

```powershell
$env:MDB_MIXTAPE_E2E_EMAIL = "you@example.com"
$env:MDB_MIXTAPE_E2E_PASSWORD = "…"
node scripts/verify-mixtape-approved-staging-e2e.mjs
```

Outputs: `tmp-mixtape-approved-e2e/report.json` and PNG screenshots.