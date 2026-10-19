Portal Mandiri backend phase 1 (not deployed)

Baseline 609b5c9. Branch feature/portal-mandiri-backend-v2.
Worktree /home/cibodas/apps/sikepel/.worktrees/portal-mandiri-backend-v2.
Production checkout, environment, data, PM2 and tunnel untouched in this attempt.

Server configuration: MANDIRI_VILLAGE_ID must be one active village UUID. Missing/invalid/inactive configuration fails closed (503). No client tenant selector. ALLOWED_ORIGINS and Cloudflare remote ingress remain deployment gates owned by lead.

POST /api/mandiri/check-nik
JSON {nik,birth_date}. Validates 16 digits and ISO date. Always returns {manual_entry:true}, including matching, missing, mismatched identities. Existence is intentionally unknown; exists is omitted. Manual entry is required. No OTP/contact verification provider exists. No resident data disclosure.

POST /api/mandiri/request
JSON {type_id,resident:{nik,name,birth_date,address,birth_place?,gender?,religion?,marital_status?,occupation?,rt?,rw?},contact_phone,form_data?:Record<string,string>}.
Multipart alternative: one data JSON field; up to three attachments fields. PDF/PNG/JPEG, 2 MB each; total body 8 MB. PDF signature/end marker validated; images decoded/re-encoded with sharp, 16 million pixel ceiling. PDF check is not malware scanning. Files private under configured SIKEPEL_DATA_DIR/attachments, random names, mode 600; directory mode 700. No download route; do not serve attachments statically.
201 {ticket,status,created_at,tracking_token,tracking_expires_at}.
Tracking token: 256 random bits, hash persisted, expires after 30 days. Never put token/NIK in URL or logs. Save token securely client-side; number alone cannot track.
Resident/master contact is never created or overwritten by public input. Both existing and new identities are unverified proposals stored in online_requests.form_data.resident; contact in contact_phone. resident_id remains null until an authorized operator verification workflow is added. This supersedes original unsafe automatic master update criteria per lead decision.

GET /api/mandiri/track/:ticket
Authorization: Bearer <tracking_token>.
Returns only {ticket,type_name,status,created_at,revision_note?}. Wrong/expired/missing token, missing ticket or wrong village all return 404.
All responses no-store. Persistent DB throttles: portal 300 requests/15 minutes, identity 10/15 minutes, submissions 5/15 minutes per identity, tracking 60/15 minutes per token. Portal-wide budget is intentionally conservative, not per-IP identification; lead must assess capacity/proxy trust before public deployment.

Schema source src/server/mandiri-schema.ts; startup runs idempotent migration only when core residents table exists. Contains status CHECK, ticket unique constraint, scope index, nullable verification metadata, token hash/expiry. No production migration performed. Fixture uses actual PostgreSQL-compatible PGlite SQL engine, not live PostgreSQL server.

src/proxy.ts blocks non-portal pages/API routes on mandiri.sikepel.biz.id. Frontend owns adding root rewrite to /mandiri; currently / on portal host returns 404. Allowed paths: /mandiri subtree, /api/mandiri subtree, /_next/static subtree. Preserve admin host denial. Shared API dispatcher file is an integration hotspot; frontend must not edit it concurrently.

GET /api/mandiri/types
Returns {types:[{id,name,code,slug,category,description,fields,defaults,requirements}]}. Active global letter types only (the project has no village/type assignment table); requirements fetched only for configured village. Fields preserve operator key/label/type/required/options schema; defaults maps nationality field keys to the shared Indonesia/WNI default. Operator form treats fields as optional; frontend should do the same. Requirements expose only id/label/mandatory, never other settings. Empty requirements mean unconfigured, not verified complete. No admin API needed.

Not implemented: verified contact sessions, operator review/master mutation, revision upload API, authenticated attachment download. These need lead-owned follow-up contracts; never reuse authenticated admin endpoints publicly.

Verification:
- RED: mandiri test failed missing module before implementation.
- GREEN: tests/mandiri.test.ts passes; migration rerun, no identity disclosure, proposals/master unchanged, secure tracking, tenant/expiry isolation, file permissions/signatures/count/size, CSRF, status/ticket constraints, throttling, host denial tested.
- npm run typecheck passes.
- npm run build passes Next 16.3.6.
- git diff --check passes.
- npm audit initially found sharp/source-map-js high advisories; compatible lockfile update yields zero vulnerabilities.
- Final full npm test with owner-approved LIBREOFFICE_PATH, LD_LIBRARY_PATH, LIBLANGTAG_DATA: exit 0, 56 tests, 56 pass, 0 fail, 31655 ms. Actual PDF/core numbering/snapshots passed. Previous converter blocker resolved.
- Discovery/check-nik RED: expected 200, actual 404 before discovery implementation. GREEN: targeted fixture passes; inactive types excluded, tenant requirements isolated, exact public fields/defaults, anti-enumeration response tested.
- Final typecheck, production build, git diff --check and npm audit pass (0 vulnerabilities).
- Runtime Node 26.7.0 vs manifest Node 22.x warning; QA should verify supported runtime.
