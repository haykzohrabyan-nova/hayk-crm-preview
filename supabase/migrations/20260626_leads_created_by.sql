-- Add lead creator tracking to the leads table.
--
-- created_by_id  → UUID FK to user_profiles; set when a CRM user manually creates a lead.
-- is_system_created → true when the lead was created by the webhook (no human actor).
-- Old leads have both as NULL/false — the UI shows nothing for them.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_system_created BOOLEAN NOT NULL DEFAULT FALSE;
