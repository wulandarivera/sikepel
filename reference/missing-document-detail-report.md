# Missing document detail

## Outcome
- Branch: `feature/missing-document-detail`, based on verified HEAD `ad5c858` (existing draft-ticket feature; no merge into main).
- Archive detail now shows read-only **Kelengkapan Berkas** before status-specific content for drafts, previews, pending, issued and cancelled letters.
- Explicit missing document names carry Wajib/Opsional labels. Displays total completed documents and mandatory count; optional missing documents do not imply mandatory incompleteness.
- Complete status: `Seluruh persyaratan wajib sudah lengkap`. Empty or absent requirements: `Persyaratan belum ditetapkan/tidak ada data persyaratan.` No misleading zero-requirement completion claim.
- DRAFT/PREVIEW resolve current village/type requirements returned by the existing authorized detail endpoint and persisted `form_data.requirement_checks`, never an outdated preview snapshot. Numbered history uses only snapshot requirements and snapshot form checks. Historic rows lacking requirements remain unknown, not reinterpreted using current configuration.
- Reuses existing strict-boolean missing/completeness helpers. No schema migration, writes, issuance semantics, expiry behavior, API permissions or converter changes.

## Verification
- RED/GREEN observed for missing resolver, historical vs current resolution, unknown empty configuration, section rendering, and archive integration.
- Six added regression tests; full suite **47 passed, 0 failed**, including actual PDF conversion, tenant permissions, historical snapshots, mandatory issuance gate, draft expiry and reservation tests. Converter environment read from owning PM2 process and supplied to tests.
- `npm run typecheck`: passed.
- `npm run build`: passed (Next.js 16.3.6).
- `git diff --check`: passed.
- Isolated production-build Playwright acceptance on port 3099: **9 cases passed, no page errors**: saved incomplete checklist with names, mobile 390px geometry, optional missing, complete draft, issued snapshot after current config change, cancelled snapshot, cross-tenant 403, read-only PIMPINAN, no configuration.
- Browser script creates randomized fixture credentials in an isolated `test-*` DB, initializes fixture setup, and removes DB/server afterward. No production authentication or fixture mutations.
- First browser run reached permission assertion and returned 403 rather than assumed 404; corrected test expectation to existing policy, then all cases passed.

## Files
- `src/lib/requirements.ts`: read-only detail resolver.
- `src/components/requirement-detail.tsx`: accessible reusable section.
- `src/components/service.tsx`: shared detail insertion.
- `tests/missing-document-detail.test.ts`: resolver/render/integration regressions.
- `scripts/missing-document-detail-browser-check.mjs`: isolated browser acceptance.
- This report; browser JSON evidence in `reference/verification/missing-document-detail-browser.json`.

## Limitations and rollback
- Existing Node 26 experimental localStorage warnings occur during test/build; no failures. Project declares Node 22; active PM2 uses Node 26.7.0, unchanged here.
- Checks reflect saved operator selections, not inspection of physical/uploaded documents. Missing historical snapshot data cannot be reconstructed; explicitly reported unknown.
- Browser layout verified with DOM geometry, not screenshot/visual font-fidelity review. Pending and legacy absent snapshot logic covered by unit tests, not generated pending/legacy browser fixtures.
- Revert the standalone feature commit, rebuild and restart only `pm2 restart sikepel`; no database rollback needed. Do not merge without owner approval.
- Deployment verification recorded after restart below.
