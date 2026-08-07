-- Per-communication AI summary produced by the promise engine (lib/ai/extract-actions.ts),
-- written by app/api/dev/process-comms. One row per processed azat.comm_events row so the
-- Communications page always has a clean summary (what it is / what it's about / what to do),
-- and so internal rep-signature / auto-reply "noise" can be split from real conversations.
-- Idempotent: comm_id is the primary key.

CREATE TABLE IF NOT EXISTS azat.comm_ai (
  comm_id    uuid PRIMARY KEY,
  headline   text,
  intent     text,
  next_step  text,
  is_noise   boolean,
  sentiment  text,
  created_at timestamptz DEFAULT now()
);

-- Match the grant surface of the sibling engine table (azat.engine_provenance).
GRANT SELECT, INSERT, UPDATE, DELETE ON azat.comm_ai TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON azat.comm_ai TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON azat.comm_ai TO anon;

-- Reload PostgREST so the new table is exposed through the REST API.
NOTIFY pgrst, 'reload schema';
