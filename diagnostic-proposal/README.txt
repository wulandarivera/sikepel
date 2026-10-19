SIK-15 isolated candidate, linked SIK-14. NOT production integration.
Baseline preparation 21d7770 / 0.5.48; candidate 0.5.49.
Observed deployed disk flow: src/server/permohonan-mandiri-admin.ts:432 audit ONLINE_REQUEST_NEEDS_REVISION; :449 notifyPermohonanStatus fire-and-forget. Gateway server.ts has socket send/store; session.ts:254 messages.update -> handleMessageUpdates. PID loaded/disk mismatch remains unresolved.
Proposed integration requiring separate approval and QA:
1. Generate UUID only for revision notification; carry through notifyPermohonanStatus HTTP request. Record attempt/result without request body, citizen IDs, recipient, URL, error message or secrets. Do not change revision DB transaction behavior.
2. Gateway validate UUID before using it; explicit deduped receipt without socket invocation; wrap existing send exactly once. Return opaque HMAC messageRef, never raw Baileys key. Preserve existing response compatibility.
3. Feed messages.update key and status to ack only with fromMe true. Log fixed stages server_ack/peer_ack/read_ack/played_ack. Neither socket_resolved nor ACK proves decrypted. Do not label these events delivered.
4. Remove/replace existing unsafe payload logging only through separately reviewed integration patch. Existing code is not automatically made privacy-safe by this module.
Candidate module has no recipient pseudonym: unnecessary. Message references use ephemeral random process-local HMAC key; no new persistent secret/config. Correlation lost across restart; TTL24h/max1000, no storage writes. Stage timestamps must be added by existing trusted log envelope; candidate events carry no clock timestamp.
Tests fake notifier/socket only; no imports of production config, Baileys, auth/session or network libraries. Source and dist plain CommonJS byte-identical candidate only, not gateway rebuild/parity remediation. Candidate dist is copied source, not gateway TypeScript build.
Known limits: not wired into admin/notifier/HTTP/gateway; no production-ready end-to-end claim. Need HTTP compatibility tests, actual notifier integration and ACK race review before deployment. Caller should adapt status enums from reviewed Baileys baseline. Current PID binary provenance unresolved; never silently rebuild/restart from current disk.
QA: node --test diagnostic-proposal/receipt-diagnostics.test.cjs
Rollback candidate: revert this commit; worktree independent. Production rollback/restart not authorized.
