-- Add author_ids array column to support multiple authors per article
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_ids text[];

-- Migrate existing single-author data into the array column
UPDATE articles
SET author_ids = ARRAY[author_id]
WHERE author_id IS NOT NULL AND author_ids IS NULL;

-- Index for efficient @> (contains) queries on author_ids
CREATE INDEX IF NOT EXISTS idx_articles_author_ids ON articles USING GIN (author_ids);
