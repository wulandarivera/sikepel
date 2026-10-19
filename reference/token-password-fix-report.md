# Setup token and password policy repair

Completed 2026-10-03 on local SIKEPEL at 100.67.16.86:3000.

## Outcome
- Existing private setup token was preserved, not regenerated or disclosed. Its hash now matches `installation_setup.token_hash`.
- Service was stopped before production PGlite access, then restarted successfully.
- Production remains pending with zero users. No production accounts were created, no installation was reset, and no user data was deleted.
- Token file mode is 0600.
- Minimum new password length is 6, maximum 256, for initial setup, managed account creation/reset, and self-service password changes. Existing login accepts existing credentials without imposing a new creation constraint. Empty optional update fields retain existing passwords.
- Wizard styles and structure were preserved; only password constraints/help changed. Management forms now provide matching constraints/help.

## Root cause
The token file had been replaced while `initializeSetup` deliberately used `ON CONFLICT DO NOTHING`. Database state retained the old hash. Production recovery confirmed `previousHashMatched: false`, then `fileHashMatchesDatabase: true`.

## Changes (10 source/test/report files)
1. `src/server/setup.ts`: shared password schema, 6-character error, explicit transactional `rotatePendingSetupToken`. Locks setup row and refuses missing/completed state or any existing users; cannot reopen completed installations.
2. `src/lib/password-policy.ts` (new): shared required and optional password schemas.
3. `src/app/api/[...path]/route.ts`: shared policy for managed users and profile changes.
4. `src/components/setup-wizard.tsx`: 6-character password/confirmation inputs and help.
5. `src/components/administration.tsx`: create/edit/profile password constraints and help.
6. `scripts/sync-setup-token.ts` (new): local-only explicit reconciliation from the existing regular token file, requires stopped systemd service, enforces 0600, verifies pending/hash/zero users, outputs only boolean/state metadata. Run from repository after `systemctl --user stop sikepel` using `./node_modules/.bin/tsx scripts/sync-setup-token.ts`, then start service. Not an HTTP endpoint; does not automatically alter hashes in initialization.
7. `tests/setup-token-password.test.ts` (new): synchronization, stale-token refusal, matching-token completion, 6 accepted/5 rejected, completed lock, existing-user lock.
8. `tests/password-policy.test.ts` (new): required/optional boundary behavior.
9. `tests/account-password-http.test.ts` (new): real isolated API create, managed reset, profile change, login.
10. `reference/token-password-fix-report.md` (new): this report. Total 10 files; 4 modified and 6 created.

## Verification
- RED: missing safe rotation assertion failed; implemented rotation and observed GREEN.
- RED: setup boundary expected minimum 6 but received minimum 12; missing shared policy assertion failed. Implemented shared policy and observed GREEN.
- Final full `npm test` with the systemd LibreOffice converter environment: **35 passed, 0 failed**, including real PDF conversion acceptance coverage.
- `npm run typecheck`: passed.
- `npm run build`: successful Next.js 16.3.6 production compilation and route generation.
- Production synchronization emitted: previousHashMatched=false, fileHashMatchesDatabase=true, pending=true, users=0, tokenFileMode=600, tokenPreserved=true.
- `systemctl --user is-active sikepel`: active.
- GET `/api/setup`: HTTP 200, `{ "pending": true }`.
- GET `/setup`: HTTP 200, contains 6-character help and minLength=6 inputs.
- Matching production token was NOT submitted to complete setup; successful completion tested only in isolated databases.

## Issues
Repository has no `.git`, so no git diff/commit was available. Node 26 emitted existing experimental localStorage warnings; tests and build still passed. One test fixture initially used a non-UUID account id; corrected to a valid UUID before confirming lock behavior. No deployment blockers remain.
