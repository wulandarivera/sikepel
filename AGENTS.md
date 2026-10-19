<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Owner development requirements
- Do not use emoji in application UI, comments, notifications or development reports.
- Before changing code, check Git status and create a feature/fix branch from main. Keep unrelated work intact.
- Use test-driven development; run relevant tests, typecheck and production build before deployment.
- Commit each independently reversible feature/fix separately. Describe behavior and verification in the commit message.
- Do not merge an unapproved feature into main. Record the deployed commit and tag accepted releases.
- Never commit .env secrets, setup tokens, .data, database exports, runtime tools or backups.
- Git rollback restores code only. Back up database/storage together before migrations; do not restore old data or perform destructive Git reset/clean without explicit owner authorization.
- Prefer git revert for removing an accepted change. Rebuild and verify the server after a code rollback.

