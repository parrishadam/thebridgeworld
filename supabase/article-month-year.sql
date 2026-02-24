ALTER TABLE articles ADD COLUMN IF NOT EXISTS month smallint;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS year smallint;
CREATE INDEX IF NOT EXISTS idx_articles_year_month ON articles (year, month);
