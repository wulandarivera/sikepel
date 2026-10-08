# Portal Mandiri redesign verification

Task: t_749fb0a7. Branch: fix/portal-mandiri-finalisasi. Base draft: 85efcbc, already present in isolated worktree. Main df4b266 is ancestor; no main merge, production edit, restart or deployment performed.

Changes: implement missing styles for draft brand/hero/cards/stepper/receipt classes, scope CSS tokens and alerts to portal, navy/teal palette, mobile header/cards/consent/actions, reduced motion and keyboard focus. Restore explicit bearer-token privacy, non-issuance status, physical pickup/no PDF warnings; remove implied WhatsApp notification promise. Keep all request/tracking APIs unchanged.

Verification (Node /usr/bin/node v22.23.3):
- TDD regression tests: 2 failures before fix, 2 passes after.
- Targeted mandiri design/UI/backend: 6/6 passed.
- npm run typecheck: passed.
- npm run build: passed, Next 16.3.6, compiled in 10.2 seconds on initial successful build; final rebuild also passed.
- node scripts/mandiri-browser-check.mjs: 13/13 cases passed, zero pageErrors. Real isolated PGlite fixtures and multipart POST (201), wrong-token rejection, correct tracking, attachment validation/preservation, explicit access download, no browser storage/token URLs, portal-host admin isolation. Required consent validity checked.
- Screenshots: 25 PNGs across home, identity, letter-type, attachments, confirmation, tracking revision (360/390/768/1440px), receipt 390px with access/ticket masked. All captured page states pass no-horizontal-overflow check. Desktop home visually reviewed; mobile confirmation review prompted consent alignment and screenshot scroll reset fixes.
- git diff --check: passed.

Limitations and release gates:
- Full npm run test executed: 65 tests, 55 pass, 10 fail. Failures in core acceptance PDF preview/issuance chain: converter unavailable in isolated worktree (503 PDF preview response). Rootless LibreOffice exists outside worktree; sandbox denied LD_LIBRARY_PATH configuration. Do not describe full suite as passing. QA/lead must rerun with authorized converter environment. No converter stubs substituted.
- npm audit: existing Next 16.3.6 aggregate high vulnerability, fixAvailable true (<16.3.8 affected). Separate backend follow-up t_2710767d, including SSRF Image Optimization advisory. No dependency changes in this UI task.
- Runtime inspected only by /proc cwd: next-server PID 2015181 belongs to operator-permohonan-mandiri-frontend worktree; separate PID 427947 belongs to 9router. Neither restarted. Production deployment of redesign remains unverified and not performed.

Evidence directory: reference/verification/portal-redesign (screenshots), portal-redesign-{tests,targeted,typecheck,build}.log, portal-redesign-audit.json, mandiri-frontend-browser.json. Evidence is ignored by Git; delivered as archive with task completion.
