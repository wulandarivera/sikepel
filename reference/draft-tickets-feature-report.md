# Draft tickets and automatic expiry

## Deployment
- Feature branch: `feature/draft-tickets-expiry`, based on `1ca6a1578a7076d66397651f8ea09e3c8167fd7b`; no main merge.
- Feature commit: `4a252140668e4d70e033e858eb79b3f5dd7d74c6`.
- Only PM2 `sikepel` was stopped for backup and restarted for deployment. HTTP `/login` returned 200. PM2 online; legacy systemd user unit remains disabled.
- Production startup log: `Draft tickets migration: 2 legacy drafts assigned`.

## Backup
- Coherent entire `.data` archive taken while PM2 sikepel stopped; running status restored in a finally block.
- Directory: `/home/cibodas/backups/sikepel/20261004-182039-draft-tickets` (private).
- Archive: `data.tar`, mode 600.
- SHA256: `28df9b8eff43d8e59f72917847864f9bfb42149efe1c75fa35f9807675190fc6`.
- Archive listing verified postgres and storage, 12,170 entries. Listing/hash retained with backup.

## Behavior
- Server CSPRNG: uppercase slug mnemonic plus 16 hexadecimal random characters (64 random bits). Type name snapshot is displayed separately. Unique index plus retained registry primary key and collision retry prevent reuse, including after expiry.
- Draft ticket is separate from official numbering; save never allocates a surat counter.
- Expiry is exactly seven days from first save. Ticket/type label/expiry survive edits. Changing type requires a new draft to avoid misleading immutable identifiers.
- Idempotent legacy migration grants seven days from first feature startup; only DRAFT/PREVIEW are migrated.
- Authorized individual retrieval, editing, preview, PDF preview retrieval, and issuance reject expired drafts. Preview optimistic update also checks database expiry; issuance checks again before touching counters.
- Expired rows are omitted from letter search/list. Ticket searchable and visible in shared list, form, archive detail and preview. WhatsApp shortage composition includes ticket and no NIK.
- Snapshot includes immutable ticket/type/expiry.
- Startup and 300,000 ms periodic cleanup execute in the same global database singleton as requests, initialized by Next instrumentation before requests. No independent PGlite opener or production clock override.
- Transactional status-qualified DELETE protects ISSUE_PENDING, ISSUED and CANCELLED. Minimal registry retains ticket, internal letter/type IDs, type name, expiry and deletion timestamp, no resident data.

## Verification
- RED observed missing ticket assertion, then GREEN; type-changing edit rejection RED observed then GREEN.
- `npm run typecheck`: passed.
- Full `npm test`: 41 passed, zero failed. Converter environment inherited from the configured LibreOffice environment; real private PDFs generated.
- `npm run build`: passed with Next 16.3.6.
- Isolated production-build Playwright acceptance passed desktop/mobile, ticket text, fixed expiry, ticket search, WhatsApp ticket/no NIK, requirements gate, saved checklist and real PDF. Fixtures deleted afterward.
- Isolated real PGlite Node process used actual timer at 10 ms with injected clock, no HTTP requests: deleted DRAFT/PREVIEW at boundary, preserved pending/issued/cancelled. Tested prior millisecond, legacy migration idempotency, deterministic collision retry including expired reserved ticket, cleanup vs pending transition, eight parallel draft saves, tenant denial and expired issuance before counters.
- Production drafts were not used as deletion test fixtures.

## Limitations / notes
- Unreferenced preview files are intentionally retained: automatic file removal was not added without a reference-aware storage garbage collector. No issued archive files are removed. Expired draft rows and their form/snapshot data are deleted from DB; private old preview bytes can remain in storage/backup.
- Existing Node 26 experimental localStorage warning appears in tests/build; tests and real conversion still pass.
- Migration DDL is idempotent; PostgreSQL cross-process concurrent migration locking has not been separately stress-tested. Deployment is the sole PM2/PGlite owner.
- Scheduler behavior was exercised in an isolated process with shortened interval; production five-minute wall-clock deletion was not tested on live drafts.
