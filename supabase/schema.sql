-- ─────────────────────────────────────────────────────────────────────────────
-- The Bridge World — Supabase schema
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- ── User profiles ──────────────────────────────────────────────────────────
-- user_id maps to Clerk's user ID (e.g. "user_abc123").
-- We do NOT use Supabase Auth — authentication is handled by Clerk.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     TEXT PRIMARY KEY,
  tier        TEXT NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free', 'paid', 'premium')),
  is_admin    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Article views ──────────────────────────────────────────────────────────
-- Tracks which articles a user has viewed in a given calendar month.
-- month is stored as 'YYYY-MM' (e.g. '2026-02').
-- The UNIQUE constraint prevents counting the same article twice in one month.

CREATE TABLE IF NOT EXISTS article_views (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  article_slug  TEXT NOT NULL,
  month         TEXT NOT NULL,     -- 'YYYY-MM'
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_slug, month)
);

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_article_views_user_month
  ON article_views (user_id, month);

-- ── Auto-update updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────
-- All access goes through server-side API routes using the service role key,
-- which bypasses RLS. The anon key has no permissions (deny-by-default).

ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_views  ENABLE ROW LEVEL SECURITY;

-- No RLS policies are defined — service role bypasses RLS automatically.
-- Add policies here if you ever allow direct browser access via the anon key.
