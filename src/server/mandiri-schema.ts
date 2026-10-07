import type { DB } from "./db";
export const mandiriSchema = `
CREATE TABLE IF NOT EXISTS online_requests (
 id uuid PRIMARY KEY,
 ticket_code text NOT NULL UNIQUE,
 resident_id uuid REFERENCES residents(id),
 type_id uuid NOT NULL REFERENCES letter_types(id),
 village_id uuid NOT NULL REFERENCES villages(id),
 form_data jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK(status IN ('PENDING_VERIFICATION','NEEDS_REVISION','APPROVED','REJECTED','COMPLETED')),
 revision_note text,
 contact_phone text NOT NULL,
 attachments jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachments)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 verified_by uuid REFERENCES users(id),
 tracking_token_hash text NOT NULL,
 tracking_expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS online_requests_scope_idx ON online_requests(village_id,created_at DESC);
CREATE TABLE IF NOT EXISTS mandiri_attempts (key text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL);
`;
export async function migrateMandiri(db: DB) {
  const exists = await db.query("SELECT to_regclass('residents') AS name");
  if (exists.rows[0]?.name) await db.exec(mandiriSchema);
}
