-- ─────────────────────────────────────────────────────────────────────────────
-- The Bridge World — FAQs table
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE faqs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT        NOT NULL,
  answer        TEXT        NOT NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_published  BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_faqs_sort_order ON faqs (sort_order);

-- ── Seed data ──────────────────────────────────────────────────────────────

INSERT INTO faqs (question, answer, sort_order, is_published) VALUES
(
  'What is The Bridge World?',
  'The Bridge World is the oldest continuously published contract bridge magazine, founded in 1929 by Ely Culbertson. It covers bidding, play, defense, tournament reports, ethics, and bridge culture for serious players of all levels.',
  1, true
),
(
  'How do I access archived issues?',
  'Visit our Issues page to browse the growing digital archive. We are continuously digitizing back issues stretching to 1929. Some content is available free, while full access requires a paid subscription.',
  2, true
),
(
  'What is the Master Solvers'' Club?',
  'The MSC is the world''s longest-running bridge feature. Each month, a panel of top experts tackles a set of bidding and play problems. Readers can submit their own solutions and compete in an annual contest. Problems use Bridge World Standard as the assumed system.',
  3, true
),
(
  'What is Bridge World Standard?',
  'Bridge World Standard (BWS) is a consensus bidding system developed by polling experts on their preferred treatments and conventions. First published in 1968, it has been revised five times (most recently in 2017). It serves as the default system for MSC problems and as a practical framework for pickup partnerships.',
  4, true
),
(
  'What are the subscription tiers?',
  'We offer Free, Paid, and Premium tiers. Free members can read selected articles. Paid subscribers get access to the full current archive. Premium subscribers get access to everything, including interactive playable hands and special features.',
  5, true
),
(
  'How do I submit a hand or problem?',
  'Use our Contact page and select the appropriate subject — "Master Solvers'' Club Problem Submission" for MSC problems, or "Challenge the Champs Hand Submission" for CTC deals. Include the full deal, vulnerability, and any relevant context.',
  6, true
),
(
  'Can I contribute an article?',
  'Yes! We welcome contributions from bridge writers. Reach out through our Contact page with "General Comments or Inquiries" selected, and include a brief description of your proposed article. Our editorial team will follow up.',
  7, true
),
(
  'How do I report a technical issue?',
  'Use our Contact page and select "Technical Issues." Please describe the problem, include the page URL if applicable, and let us know which browser and device you''re using.',
  8, true
);
