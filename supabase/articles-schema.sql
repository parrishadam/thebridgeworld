-- ─────────────────────────────────────────────────────────────────────────────
-- The Bridge World — Articles table
-- Run this in the Supabase SQL editor after schema.sql has been applied:
-- https://supabase.com/dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Articles ───────────────────────────────────────────────────────────────
-- Stores article metadata and content blocks.
-- author_id optionally links to a user_profiles row (Clerk user ID).
-- content_blocks is a JSONB array of structured content block objects.

CREATE TABLE IF NOT EXISTS articles (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT        NOT NULL,
  slug                TEXT        NOT NULL UNIQUE,
  author_name         TEXT,
  author_id           TEXT        REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  category            TEXT,
  tags                TEXT[]      NOT NULL DEFAULT '{}',
  access_tier         TEXT        NOT NULL DEFAULT 'free'
                        CHECK (access_tier IN ('free', 'paid', 'premium')),
  excerpt             TEXT,
  status              TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'submitted', 'published')),
  content_blocks      JSONB       NOT NULL DEFAULT '[]',
  featured_image_url  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at        TIMESTAMPTZ
);

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_articles_slug
  ON articles (slug);

CREATE INDEX IF NOT EXISTS idx_articles_status
  ON articles (status);

CREATE INDEX IF NOT EXISTS idx_articles_published_at
  ON articles (published_at);

-- ── Auto-update updated_at ─────────────────────────────────────────────────
-- Reuses the update_updated_at() function defined in schema.sql.

DROP TRIGGER IF EXISTS articles_updated_at ON articles;
CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────
-- All access goes through server-side API routes using the service role key,
-- which bypasses RLS. The anon key has no permissions (deny-by-default).

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- No RLS policies are defined — service role bypasses RLS automatically.
-- Add policies here if you ever allow direct browser access via the anon key.
