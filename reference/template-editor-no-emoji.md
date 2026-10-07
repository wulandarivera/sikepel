# Template editor text-only headings

Task: t_4251d8d3
Branch: fix/template-editor-no-emoji
Base: 06a3ba2
Worktree: /home/cibodas/apps/sikepel/.worktrees/template-editor-no-emoji

Removed five decorative emoji from the variable catalogue headings. Labels, insertion handlers, layout classes and grouping remain unchanged. Added source-wide compliance tests for src/**/*.ts, src/**/*.tsx and src/**/*.css; plain copyright, registered and trademark symbols remain allowed.

Verification on Node v22.23.3:
- RED against unchanged 06a3ba2 worktree: compliance fails at template-editor-modal.tsx lines 922, 937, 952, 967 and 984; no other source violations found.
- GREEN: ui-no-emoji plus mandiri-ui tests 5/5 pass; source-wide scan reports no violations.
- npm run typecheck: exit 0.
- npm run build: exit 0, Next.js 16.3.6.
- node scripts/mandiri-browser-check.mjs: 10 cases pass, pageErrors empty; isolated fixtures, 360/390/768/1440px geometry, host isolation and private tracking.
- git diff --check: exit 0.
- npm test without converter configuration: 51/61 pass, 10 fail (PDF preview 503 and dependent core-suite failures).
- Full regression with documented rootless LibreOffice environment could not run: headless security approval rejects LD_LIBRARY_PATH. No bypass attempted. QA previously verified baseline 59/59 with approved converter environment; this is not evidence for the changed commit.

Remaining gate: approved converter environment, full regression on this branch. No production checkout/build/deployment, tunnel, .env or production database changes. Fixture testing uses isolated PGlite, not native PostgreSQL. Public deployment remains a separate lead gate.
