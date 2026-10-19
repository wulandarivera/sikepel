# Requirements checklist feature

## Outcome
- Branch: `feature/letter-requirements`, based on `df4b266` (`baseline-20261003`). No merge into main.
- Admin configures stable requirement IDs, labels and mandatory flags per letter type and active village. Controls are in Profil Kelurahan and scoped Super Admin Jenis Surat.
- Data Surat includes Catatan Petugas checklist, counts and optional reporter WhatsApp phone. Requirements start unchecked; incomplete drafts and previews are allowed.
- Preview summary/checklist is on the left and PDF on the right at desktop widths; mobile stacks summary first.
- Issuance is disabled for incomplete mandatory requirements and stale requirement snapshots. Direct issuance API independently enforces this before number allocation. Optional unchecked requirements do not block.
- Requirement changes are serialized against number allocation using letter type locks. Issued/pending retries preserve historical snapshots and number idempotency.
- WhatsApp action opens an encoded wa.me compose containing name, letter type and only missing requirement labels. No NIK is added; nothing is sent automatically. Indonesian 08 and +62 formats are normalized and validated only for composition.

## Persistence and safety
Uses existing settings JSON metadata under `requirements:<village UUID>:<type UUID>` and existing letter form_data/snapshot JSON. No schema migration, production fixture, production account creation or production data change was performed. No official requirement list was invented. Existing letters with no configuration continue to issue. Configuration API requires ADMIN/SUPER_ADMIN, active village scope, validates unique IDs and rejects mismatched supplied village IDs.

## Verification
- Initial acceptance test failed with 403 on the missing configuration API before feature implementation.
- Final `npm test`: 38 passed, 0 failed, with the systemd LibreOffice environment and isolated databases; real PDF conversion exercised.
- `npm run typecheck`: passed.
- `npm run build`: passed, Next.js 16.3.6 production build generated.
- `node scripts/requirements-browser-check.mjs`: passed on isolated production-build server at 127.0.0.1:3097. Verified admin controls, initially unchecked checklist, disabled issue, direct API gate, encoded WhatsApp without NIK, persisted checks, complete enables issue, real PDF and desktop/mobile DOM geometry. No page errors.
- Browser evidence: `/home/cibodas/apps/sikepel/reference/verification/requirements-browser.json`.
- Full test log: `/home/cibodas/.hermes/profiles/project-lead/cache/scratch/requirements-tests-final.log`.
- `git diff --check`: passed.

## Deployment state and review
Production systemd service remains **inactive and disabled**, matching the original state. Production build exists in the installation, but no persistent server was enabled or started. Temporary verification server was stopped and its synthetic database removed. Owner approval is required before merging or starting the production service.

Review with `git diff main...feature/letter-requirements` and this report. Repeat browser verification with the three converter environment variables from the unit, then `node scripts/requirements-browser-check.mjs`; it requires Playwright Chromium (`npx playwright install chromium`).

## Changed files
- src/app/api/[...path]/route.ts
- src/app/globals.css
- src/components/administration.tsx
- src/components/service.tsx
- src/components/requirements.tsx
- src/lib/requirements.ts
- src/server/requirements.ts
- src/server/letters.ts
- tests/core.test.ts
- tests/requirements.test.ts
- scripts/requirements-browser-check.mjs
- reference/requirements-feature-report.md

## Issues encountered
Playwright Chromium and the old msedge channel were absent; installed Chromium and verified successfully. Browser fixture needed its required expiry date filled before preview. Node 26 emits the existing experimental localStorage warning during tests/build; it did not fail verification. The first acceptance run after adding a third allocation required the existing sequence-count expectation to change from two to three.
