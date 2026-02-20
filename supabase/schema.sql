-- ─────────────────────────────────────────────────────────────────────────────
-- The Bridge World — Supabase schema
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- ── User profiles ──────────────────────────────────────────────────────────
-- user_id maps to Clerk's user ID (e.g. "user_abc123").
-- We do NOT use Supabase Auth — authentication is handled by Clerk.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id        TEXT PRIMARY KEY,
  tier           TEXT NOT NULL DEFAULT 'free'
                   CHECK (tier IN ('free', 'paid', 'premium')),
  is_admin       BOOLEAN NOT NULL DEFAULT false,
  is_contributor BOOLEAN NOT NULL DEFAULT false,
  is_author      BOOLEAN NOT NULL DEFAULT false,
  is_legacy      BOOLEAN NOT NULL DEFAULT false,
  bio            TEXT,
  photo_url      TEXT,
  first_name     TEXT,
  last_name      TEXT,
  email          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- ── Categories ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  color       TEXT,                 -- hex string e.g. '#2563eb'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories (sort_order);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Seed data (safe to re-run — INSERT … ON CONFLICT DO NOTHING)
INSERT INTO categories (name, slug, description, color, sort_order) VALUES
  ('Bidding',            'bidding',            'Bidding systems, conventions, and theory',  '#2563eb', 10),
  ('Play',               'play',               'Declarer play techniques and cardplay',      '#16a34a', 20),
  ('Defense',            'defense',            'Defensive technique and signals',            '#dc2626', 30),
  ('Convention',         'convention',         'Convention descriptions and how-to guides',  '#7c3aed', 40),
  ('Tournament Report',  'tournament-report',  'Results and stories from tournaments',       '#0891b2', 50),
  ('Humor',              'humor',              'Light-hearted bridge fun',                   '#d97706', 60),
  ('History',            'history',            'Bridge history and notable players',         '#92400e', 70),
  ('Profile',            'profile',            'Player profiles and interviews',             '#0f766e', 80),
  ('Puzzle',             'puzzle',             'Bridge puzzles and problems',                '#be185d', 90),
  ('Editorial',          'editorial',          'Commentary and opinion',                     '#64748b', 100)
ON CONFLICT (name) DO NOTHING;

-- ── Tags ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Migrate existing tags from articles into the tags table
-- (safe to re-run; ON CONFLICT DO NOTHING skips duplicates)
INSERT INTO tags (name, slug)
SELECT DISTINCT
  lower(trim(tag))                                                      AS name,
  lower(regexp_replace(trim(tag), '[^a-z0-9]+', '-', 'g'))              AS slug
FROM articles, unnest(tags) AS tag
WHERE trim(tag) <> ''
ON CONFLICT (name) DO NOTHING;
