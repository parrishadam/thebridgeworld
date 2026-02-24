-- ─────────────────────────────────────────────────────────────────────────────
-- The Bridge World — Profile columns for user editing & public profiles
-- Run this in the Supabase SQL editor after schema.sql has been applied
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS skill_level text CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert', 'world_class')),
  ADD COLUMN IF NOT EXISTS location text;
