CREATE TABLE IF NOT EXISTS wa_auto_replies (
  id uuid PRIMARY KEY,
  keyword text NOT NULL,
  match_type text NOT NULL CHECK(match_type IN ('EXACT', 'CONTAINS', 'REGEX')),
  reply_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_auto_replies_active_idx ON wa_auto_replies(is_active);
