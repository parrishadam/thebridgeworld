-- Migration: Convert all "10" to "T" in BridgeHandBlock card holdings.
-- This normalizes the ten notation so cards are always single-character tokens.
-- Run on a test copy first!

UPDATE articles
SET content_blocks = (
  SELECT jsonb_agg(
    CASE WHEN block->>'type' = 'bridgeHand' THEN
      jsonb_set(block, '{data,hands}',
        (SELECT jsonb_object_agg(dir,
          jsonb_build_object(
            'S', replace(hand->>'S', '10', 'T'),
            'H', replace(hand->>'H', '10', 'T'),
            'D', replace(hand->>'D', '10', 'T'),
            'C', replace(hand->>'C', '10', 'T')
          ))
        FROM jsonb_each(block->'data'->'hands') AS t(dir, hand))
      )
    ELSE block
    END
  FROM jsonb_array_elements(content_blocks) AS block
)
WHERE content_blocks::text LIKE '%"10"%';
