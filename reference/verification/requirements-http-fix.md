# Requirements editor HTTP fix verification

Base: feature/letter-requirements, commit 327e208. Fix branch: fix/requirements-http-add. No merge to main.

## Root cause and RED
The real Chromium click on Tambah Persyaratan at http://100.67.16.86:3098 failed to add a row. Runtime: isSecureContext=false, typeof crypto.randomUUID=undefined, typeof crypto.getRandomValues=function. Page error: crypto.randomUUID is not a function. The click handler threw before setList. This was not a disabled button, missing handler, or form submission. Earlier localhost acceptance used a potentially trustworthy secure context and did not test this click.

The browser regression was run against the existing production build before changing application code, with an isolated test database and generated fixture credentials. RED evidence: requirements-editor-red.json. A unit regression also failed before createRequirementId existed.

## Fix
Generate UUID-v4-shaped entry IDs using crypto.getRandomValues, which works on insecure HTTP. Keep IDs unchanged on label editing. No Math.random fallback, authentication changes, server token changes, schema migration, or production data writes.

## GREEN
- Unit regression: 1 passed; 100 unique UUID-v4-shaped IDs without randomUUID.
- Full npm test with Linux converter environment from ecosystem.config.cjs: 39 passed, 0 failed, 0 skipped. Real PDF conversion acceptance passed.
- npm run typecheck passed.
- npm run build passed.
- Browser acceptance on actual tailnet IP over HTTP: four cases passed (ADMIN and scoped SUPER_ADMIN, 1440x1050 and 390x844). Each checked add, edit, remove, save, reload, stable IDs; zero page errors. Runtime remained insecure with randomUUID unavailable. Evidence: requirements-editor-browser.json.
- git diff --check passed.

## Deployment
Restarted ONLY pm2 restart sikepel. PM2 sikepel online, PID 48676. Other PM2 process PIDs and restart counts unchanged. Production /login returned HTTP 200 after readiness; immediate first probe raced startup and returned 000. Port 3000 belongs to PID 48676; isolated port 3098 no longer listening. Production authenticated mutations deliberately not tested: all editor writes used isolated fixtures, cleaned up after server shutdown.

## Harness issue
Seed fixtures lack installation_setup, causing initial isolated login readiness to fail. Browser harness now initializes completed setup state only in its unique isolated database after fixture creation and before starting Next. No production setup was touched.

## Reversal
Revert the fix commit on this branch, rebuild, restart only PM2 sikepel. No database rollback required. Main and original feature branch remain unchanged.

## Known warning
Node 26 emitted existing ExperimentalWarning about localStorage without --localstorage-file during build/tests. This did not fail verification.
