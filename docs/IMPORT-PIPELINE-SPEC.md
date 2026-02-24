# Bridge World PDF Import Pipeline — Build Spec

## Overview

Build an admin tool at `/admin/import` that lets me upload a Bridge World magazine PDF, have Claude parse it into structured articles, review/edit the results, and publish to Supabase. This replaces a manual process that currently takes hours per issue and needs to scale to ~1000 issues.

## Project Context

- **Stack:** Next.js 14 (App Router), Supabase (Postgres), Clerk auth, Tailwind CSS
- **Repo:** `~/projects/bridge-world`
- **Existing admin system:** `/admin` page with Clerk auth, `is_admin` check on `user_profiles` table
- **Existing article editor:** Full CRUD at `/editor/[id]` with `ArticleEditor.tsx`, `BlockList.tsx`, `BridgeHandModal.tsx`, `BiddingTableModal.tsx`
- **Existing article renderer:** `SupabaseArticleRenderer.tsx` renders all block types
- **Existing API:** `POST /api/articles` creates articles, uses `getSupabaseAdmin()` for service-role access

## Database Schema

### Existing `articles` table columns used:
```
title, slug, author_name, category, tags (text[]), access_tier, status,
excerpt, content_blocks (jsonb), published_at, issue_id (uuid FK), source_page (int)
```

### Existing `issues` table (already created):
```sql
CREATE TABLE issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,        -- "January 1992"
  slug text NOT NULL UNIQUE,  -- "1992-01"
  month integer NOT NULL,
  year integer NOT NULL,
  volume integer,
  number integer,
  cover_image_url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(year, month)
);
```

### ContentBlock types (from `src/types/index.ts`):

```typescript
type TextBlock = {
  id: string;
  type: "text";
  data: { text: string };
};

type BridgeHandBlock = {
  id: string;
  type: "bridgeHand";
  data: {
    hands: Record<"north"|"south"|"east"|"west", { S: string; H: string; D: string; C: string }>;
    visibleHands: Record<"north"|"south"|"east"|"west", boolean>;
    dealer: string;       // "North", "South", "East", "West", or ""
    vulnerability: string; // "None", "N-S", "E-W", "All", or ""
    contract: string;     // e.g. "4♠", "3NT", ""
    lead: string;         // e.g. "♥K", ""
    title: string;        // e.g. "Deal 1", ""
  };
};

type BiddingTableBlock = {
  id: string;
  type: "biddingTable";
  data: {
    dealer: string;
    bids: Array<{ text: string; alert: string | null }>;
  };
};
```

Card holdings use "10" (not "T") — e.g. `"S": "AK1063"`. Each visible hand must total exactly 13 cards.

## What to Build

### 1. API Route: `POST /api/admin/import`

**Input:** multipart form with a PDF file, plus metadata (month, year, volume, number).

**Processing steps:**

a. **Extract text from PDF.** Use `pdf-parse` (npm package) for modern PDFs with selectable text. For scanned PDFs (pre-~1990), use Tesseract.js or shell out to `tesseract` CLI. Detect which type by checking if `pdf-parse` returns meaningful text.

b. **Send extracted text to Claude API** to parse into structured articles. Use the Anthropic SDK (`@anthropic-ai/sdk`). The prompt should:
   - Include the full extracted text (or page-by-page for long issues)
   - Specify the exact JSON output format matching ContentBlock types
   - Instruct Claude to split into individual articles, identifying titles, authors, categories
   - Instruct Claude to extract hand diagrams as BridgeHandBlock with all 4 hands when visible
   - Instruct Claude to extract bidding sequences as BiddingTableBlock
   - Instruct Claude to tag articles with player names mentioned and thematic tags like "counting" (when counting HCP or shape is key to a decision), "squeeze", "endplay", "deception", etc.
   - Require that every visible hand totals exactly 13 cards
   - Include the Bridge World's standard article categories: Editorial, Tournament Report, Bidding Theory, Card Play, Defense, Swiss Match, Challenge the Champs, Master Solvers' Club, Test Your Play, Letters, History, Convention, Book Review

c. **Validate the response:** Check JSON parses, all hands have 13 cards, all auctions have valid bids. Return structured errors for anything that fails validation.

d. **Return** the array of parsed articles as JSON to the frontend.

**Important:** Store the Anthropic API key as `ANTHROPIC_API_KEY` in `.env.local`. The project already has Supabase and Clerk env vars configured.

### 2. Admin Page: `/admin/import`

**Auth:** Same pattern as existing `/admin` — require Clerk auth + `is_admin` check.

**UI flow:**

**Step 1 — Upload**
- File input for PDF
- Issue metadata fields: month (dropdown), year (number), volume (number), number (number)
- "Parse PDF" button
- Show progress/loading state (parsing can take 30-60 seconds for a full issue)

**Step 2 — Review**
- Show list of extracted articles in a sidebar/accordion
- Each article shows: title, author, category, tags, page number, block count
- Clicking an article shows its content rendered using `SupabaseArticleRenderer` (preview mode)
- **Edit capabilities for each article:**
  - Edit title, author, category, tags, excerpt inline
  - Edit/reorder/delete content blocks using existing `BlockList` component
  - Add new blocks using existing modal editors (BridgeHandModal, BiddingTableModal)
  - Highlight hands that fail validation (non-13 card count) in red
- "Re-parse" button to re-send a single article's text to Claude for a better extraction
- "Delete" button to remove an article from the import batch

**Step 3 — Publish**
- "Publish All" button that:
  - Creates or finds the issue record in `issues` table
  - Creates each article via `POST /api/articles` (or direct Supabase insert) with `issue_id` and `source_page`
  - Sets `status: 'published'`, `access_tier: 'paid'`, `published_at` to the issue date
  - Shows success/error state per article
- "Publish Selected" to publish only checked articles

### 3. Claude Parsing Prompt

This is the most critical piece. Store it in `src/lib/importPrompt.ts` so it can be iterated on. The prompt should be something like:

```
You are parsing a Bridge World magazine issue into structured articles.

For each article, return a JSON object with:
- title, author_name, category, tags (array), source_page, excerpt
- content_blocks: array of ContentBlock objects

Content block types:
- TextBlock: { id, type: "text", data: { text } }
  Use markdown bold (**text**) for headings within articles.
  Use '' for apostrophes in text.

- BridgeHandBlock: { id, type: "bridgeHand", data: { hands, visibleHands, dealer, vulnerability, contract, lead, title } }
  hands: { north: {S,H,D,C}, south: {S,H,D,C}, east: {S,H,D,C}, west: {S,H,D,C} }
  Use "10" not "T" for tens. Each visible hand MUST have exactly 13 cards.
  Set visibleHands to false for hands not shown in the original.

- BiddingTableBlock: { id, type: "biddingTable", data: { dealer, bids: [{text, alert}] } }
  Use standard abbreviations: Pass, Dbl, Rdbl, 1C, 1D, 1H, 1S, 1NT, etc.
  Include all four seats' bids in order. Use "—" for seats that haven't bid yet.

CRITICAL RULES:
1. Transcribe EVERY paragraph of text. Do not summarize or skip content.
2. Every hand diagram in the magazine becomes a BridgeHandBlock.
3. Every bidding sequence becomes a BiddingTableBlock.
4. Every visible hand must total exactly 13 cards.
5. Preserve the order of content exactly as it appears in the magazine.
6. Tag articles with names of all players/people mentioned.
7. Tag articles with "counting" if counting HCP or distributional shape is key to a decision.

Return a JSON array of article objects.
```

### 4. Issues Index Page: `/issues`

Replace the existing placeholder at `src/app/issues/page.tsx`:
- Query `issues` table ordered by year desc, month desc
- Show a grid/list of issues with title, date, article count
- Link each issue to `/issues/[slug]` which shows all articles for that issue
- Each article links to `/articles/[slug]`

## Files to Create/Modify

### New files:
- `src/app/admin/import/page.tsx` — Import page (server component with auth)
- `src/app/admin/import/ImportClient.tsx` — Client component with upload/review/publish UI
- `src/app/api/admin/import/route.ts` — PDF parsing API route
- `src/lib/importPrompt.ts` — Claude prompt template
- `src/lib/validateBlocks.ts` — Card count and block validation utilities
- `src/app/issues/page.tsx` — Replace placeholder with real issues index
- `src/app/issues/[slug]/page.tsx` — Issue detail page showing articles

### Modified files:
- `src/app/admin/page.tsx` — Add link to import tool in admin nav

### Dependencies to install:
- `pdf-parse` — PDF text extraction
- `@anthropic-ai/sdk` — Claude API client

## Key Design Decisions

1. **Claude API, not regex, for parsing.** The magazine format varies across decades, OCR is noisy, and bridge notation has too many variants. Claude handles all of this. The prompt is the "parser" and can be iterated.

2. **Page-by-page or full-text?** For issues under ~50 pages, send the full text in one API call. For longer issues or when the response is truncated, split into per-article chunks (use the table of contents to identify article boundaries first, then parse each article separately).

3. **Scanned vs. selectable text PDFs.** The last ~30 years of Bridge World were produced in InDesign and have selectable text. Pre-~1990 issues are scans requiring OCR. The API route should handle both. For OCR, use Tesseract at 300 DPI.

4. **Reuse existing editor components.** The review UI should reuse `BlockList`, `BridgeHandModal`, `BiddingTableModal`, and `SupabaseArticleRenderer` rather than building new editing UIs.

5. **The review step is essential.** AI parsing won't be perfect. The review UI is what makes imperfect parsing usable. Don't skip it.

## Example Data

There are already 14 articles from the January 1992 issue in the database (slug pattern: `1992-01-*`). These can be used as reference for expected output format. Query them with:

```sql
SELECT title, slug, source_page, category, tags, 
       jsonb_array_length(content_blocks) as block_count
FROM articles 
WHERE slug LIKE '1992-01-%'
ORDER BY source_page;
```

## Additional Tagging Rule

Every article imported from an issue should include the issue name (e.g. "January 1992") as a tag. This allows filtering/searching all articles from a specific issue via the existing tag system.

## Bridge World Format Notes

### Partial Hands
The magazine frequently shows only 2 hands (e.g. West and East for a bidding problem, or North and South for a declarer play problem). When parsing, set `visibleHands` to `false` and use empty strings for `S`, `H`, `D`, `C` for the hidden seats. Only visible hands need 13-card validation.

### Two-Player Auction Format
The Bridge World often shows auctions as a two-column layout for one partnership (e.g. West and East), with opponent bids shown in parentheses inline. For example:
```
Russell      Lev
1 ♣  (4 ♠)  Pass
Double       5 ♦
6 ♦          Pass
```

This means the full four-player auction is:
West: 1♣, North: 4♠, East: Pass, South: Pass, West: Dbl, North: Pass, East: 5♦, South: Pass, West: 6♦, East: Pass, Pass, Pass.

When parsing these into BiddingTableBlock, expand to the full four-player format. Bids in parentheses are opponent bids. Implied passes (not shown) should be filled in.

### Inline Hands in Text
Articles sometimes show partial hands inline in prose, like:
"partner had, ♠QJ109764 ♥Q3 ♦7 ♣A83"
These should stay as text in a TextBlock, not be extracted as BridgeHandBlock. Only create BridgeHandBlock for hands shown in the compass/diagram format.

### Tournament Report Auctions (Table 1 / Table 2)
Tournament reports show one hand diagram followed by two auctions from different tables. Each auction is labeled (Table 1, Table 2) and includes player names under direction headers:
```
Table 1
SOUTH    WEST     NORTH    EAST
Russell  Zia      Lev      Deutsch
—        1♦       Pass     1♠
2♥       3♠       4♥       4♠
Dbl      Pass     Pass     Pass
```

The BiddingTableBlock type should be extended with optional fields:
- `label: string` (e.g. "Table 1")  
- `players: Record<"north"|"south"|"east"|"west", string>` (e.g. `{ south: "Russell", west: "Zia" }`)

The renderer should display the label and player names when present.
