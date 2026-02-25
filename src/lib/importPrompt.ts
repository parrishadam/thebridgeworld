/**
 * Claude prompt templates for parsing Bridge World magazine PDFs.
 *
 * Two-pass approach:
 *   Pass 1 (TOC): Full text with page markers → issue metadata + article list with page ranges
 *   Pass 2 (article): Article's page text only → content_blocks for one article
 */

export const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Shared rules (included in both prompts) ─────────────────────────────────

const CATEGORIES = `Choose the single best category for each article:
Editorial, Tournament Report, Bidding Theory, Card Play, Defense, Swiss Match,
Challenge the Champs, Master Solvers' Club, Test Your Play, Letters, History,
Convention, Book Review, Improve Your Play, Improve Your Defense, Playing Suit Combinations`;

const TAGGING_RULES = `1. Include the names of ALL players and people mentioned in the article.
2. Include thematic technique tags when relevant:
   - "counting" — if counting HCP or distributional shape is key to a decision
   - "squeeze" — if a squeeze play or squeeze technique is discussed
   - "endplay" — if an endplay or throw-in is discussed
   - "deception" — if deceptive play or false-carding is discussed
   - "signaling" — if defensive signaling is a key topic
   - "opening lead" — if opening lead choices are a major focus
   - "slam bidding" — if slam bidding methods are discussed
   - "competitive bidding" — if competitive bidding decisions are a focus
3. ALWAYS include the issue title (e.g. "January 1992") as a tag for every article.
4. Include event/tournament names (e.g., "Bermuda Bowl", "Vanderbilt", "Spingold").
5. Include convention names when discussed (e.g., "Stayman", "Blackwood", "transfers").
6. Include "MSC" tag for all Master Solvers' Club articles.
7. Include "CTC" tag for all Challenge the Champs articles.
8. For problem articles, include the sub-category tag: "test your play", "improve your defense", etc.`;

const JSON_OUTPUT_RULES = `OUTPUT FORMAT — STRICTLY ENFORCED
=================================
Your response must be ONLY a single JSON object. Nothing else.
- Do NOT include markdown code fences (no \`\`\`json or \`\`\`).
- Do NOT include any text before or after the JSON.
- Do NOT include any explanation, commentary, or notes.
- The very first character of your response must be { and the very last character must be }.
- Ensure the JSON is valid — all strings properly escaped, no trailing commas.`;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the full text with page markers from per-page text array.
 * Produces: ───── PDF PAGE 1 ─────\n<text>\n\n───── PDF PAGE 2 ─────\n<text>...
 */
export function buildMarkedText(pageTexts: string[]): string {
  return pageTexts
    .map((text, i) => `───── PDF PAGE ${i + 1} ─────\n${text}`)
    .join("\n\n");
}

/**
 * Build a condensed version of the PDF text for the TOC pass.
 * Sends the first FULL_PAGES pages in full (masthead + table of contents),
 * then only the first few lines of every subsequent page (to catch article
 * titles, headers, and continuation markers like "Solutions overleaf").
 */
const TOC_FULL_PAGES = 5;
const TOC_PEEK_LINES = 6;

export function buildTocText(pageTexts: string[]): string {
  return pageTexts
    .map((text, i) => {
      const pageNum = i + 1;
      if (i < TOC_FULL_PAGES) {
        return `───── PDF PAGE ${pageNum} ─────\n${text}`;
      }
      // For remaining pages, include only the first few lines
      const lines = text.split("\n").slice(0, TOC_PEEK_LINES).join("\n");
      return `───── PDF PAGE ${pageNum} (header only) ─────\n${lines}`;
    })
    .join("\n\n");
}

// ── Pass 1: Table of Contents ───────────────────────────────────────────────

export function buildTocPrompt(markedText: string, issueMonth?: number): string {
  const nextMonthFilter = issueMonth
    ? `\n\nIGNORE NEXT-MONTH CONTENT\n=========================\nIf the issue month is ${MONTH_NAMES[issueMonth]}, IGNORE any articles whose titles reference the NEXT month (${MONTH_NAMES[issueMonth === 12 ? 1 : issueMonth + 1]}). For example, if this is the April issue, remove articles like "May Problems", "May Bidding Match", "West Hands for May", "East Hands for May", etc. These are previews for the next issue and should NOT be included in the article list.\n`
    : "";

  return `You are parsing a Bridge World magazine issue. Your job in this pass is to extract the issue metadata and a table of contents — a list of all articles with their metadata. Do NOT extract article content or content_blocks yet.

The text below has been extracted from a PDF. The first few pages are shown in full (masthead, table of contents). Remaining pages show only their first few lines (headers and article titles) — marked with "(header only)". Use the table of contents page and the page headers to identify which PDF pages contain each article.

INPUT TEXT
==========
${markedText}
==========

ISSUE METADATA EXTRACTION
=========================
Extract the issue metadata from the masthead, table of contents, or cover page.
Every Bridge World issue contains text like "VOL. 63 NO. 4 JANUARY 1992" or similar.
Look for volume, number, month, and year.

RESPONSE FORMAT
===============
Return a JSON object with this structure:
{
  "issue": {
    "month": 1,
    "year": 1992,
    "volume": 63,
    "number": 4,
    "title": "January 1992"
  },
  "articles": [
    {
      "title": "Article Title",
      "author_name": "Author Name",
      "category": "Card Play",
      "tags": ["player name", "technique"],
      "source_page": 5,
      "pdf_pages": [[7, 10]],
      "excerpt": "One or two sentence summary."
    }
  ]
}

- "month": integer 1-12
- "year": integer (e.g. 1992)
- "volume": integer or null if not found
- "number": integer or null if not found
- "title": string in the format "Month Year" (e.g. "January 1992")

For each article:
- title: the article's title
- author_name: the author, or "" if none
- category: one of the categories below
- tags: array of strings (see tagging rules below)
- source_page: the magazine's printed page number where the article starts, or 0 if unknown
- pdf_pages: an array of [start, end] page ranges using the PDF PAGE numbers from the markers above. Each element is a two-element array [firstPage, lastPage] for a contiguous run of pages. Use multiple ranges for non-contiguous content. Examples:
    - Simple article on pages 7-10: [[7, 10]]
    - Single-page article on page 5: [[5, 5]]
    - Article on pages 4-7 with solutions on page 73: [[4, 7], [73, 73]]
    - Article split across pages 33-34 and 56-58: [[33, 34], [56, 58]]
- excerpt: 1-2 sentence summary of the article

PAGE RANGE RULES — CRITICAL
============================
- pdf_pages uses the "PDF PAGE N" markers above, NOT the magazine's printed page numbers.
- Each [start, end] pair must satisfy start <= end.
- Articles CAN share page numbers. When one article ends and another begins on the same page, BOTH articles should include that page in their ranges. For example, if "Peachtree Soloway" ends mid-page 7 and "Test Your Play" starts at the bottom of page 7, then "Peachtree Soloway" has [[4, 7]] and "Test Your Play" has [[7, 7], [73, 73]].
- Most articles span only 2-6 PDF pages. A typical issue has 60+ pages split among 10-15 articles.
- Be PRECISE: find the exact page where each article's title/heading appears (start of first range) and where its text ends (end of last contiguous range).
- Use a SINGLE range when pages are contiguous: [[4, 7]] not [[4, 5], [6, 7]].
- Use MULTIPLE ranges only when content is on non-adjacent pages (e.g., problems on one page, solutions 40 pages later).

ARTICLE CONTINUATIONS & SOLUTIONS
==================================
The Bridge World frequently continues articles across non-adjacent pages or places solutions separately. Watch for these indicators:
- "Solutions overleaf" / "Solutions on page XX" / "(Solution on page XX.)"
- "Continued on page XX" / "(continued from page XX)"
- "[See top of next column.]"
- Solution sections labeled "Solutions to [Article Title]"

When an article has content on non-contiguous pages, use SEPARATE ranges in pdf_pages for each section. For example:
- Problems on p.7, solutions on p.73: "pdf_pages": [[7, 7], [73, 73]]
- Main content pp.15-18, continued on pp.45-46: "pdf_pages": [[15, 18], [45, 46]]

SOLUTION MERGING — ABSOLUTELY CRITICAL
=======================================
Any section titled "[Something] Solutions" (e.g. "Test Your Play Solutions", "Improve Your Defense Solutions") is NOT a separate article. It is the solutions section of the article titled "[Something]".

YOU MUST:
1. Create ONE article using the base title (e.g. "Test Your Play", not "Test Your Play Solutions")
2. Include BOTH the problems pages AND the solutions pages in that article's pdf_pages
3. NEVER create an article with "Solutions" in its title — these do not exist as standalone articles

EXACT matching only:
- "Test Your Play Solutions" belongs to "Test Your Play" (EXACT prefix match)
- "Improve Your Play Solutions" belongs to "Improve Your Play"
- "Improve Your Defense Solutions" belongs to "Improve Your Defense"
- "Test Your Defense Solutions" belongs to "Test Your Defense"
- "Playing Suit Combinations Solutions" belongs to "Playing Suit Combinations"
- "Test Your Defense" and "Improve Your Defense" are DIFFERENT articles — do NOT merge them

Example: If "Test Your Play" problems are on page 7 and "Test Your Play Solutions" is on page 73:
→ Create ONE article: { "title": "Test Your Play", "pdf_pages": [[7, 7], [73, 73]] }
→ Do NOT create a second article for the solutions

INTERLEAVED ARTICLE LAYOUT — CRITICAL
=======================================
Bridge World interleaves small recurring features WITHIN longer main articles. Understanding
this layout is essential for correct page ranges.

MAIN articles vs INTERLEAVED articles:
- A MAIN article's title appears at the TOP of a page (it's the page's primary content)
- An INTERLEAVED article's title appears MID-PAGE within a main article's flow
- Small recurring features (Test Your Play, Improve Your Defense, Test Your Defense,
  Improve Your Play, Playing Suit Combinations) are typically INTERLEAVED — they start
  mid-page within a long main article like a tournament report

How to determine a main article's END page:
- A main article continues until a NEW MAIN article title appears at the top of a page
- An interleaved article appearing mid-page does NOT end the main article
- The main article's content resumes after the interleaved article on the same or next page

Example: "Peachtree Soloway" (tournament report) runs from page 3 to page 31. Interleaved
within it are: "Test Your Play" (bottom of page 7), "Improve Your Defense" (mid-page 9),
"Test Your Defense" (mid-page 17), "Playing Suit Combinations" (mid-page 25).
→ "Peachtree Soloway" pdf_pages: [[3, 31]] (the full span — it continues around the interleaved articles)
→ "Test Your Play" pdf_pages: [[7, 7], [73, 73]] (problem page + solution page)
→ Pages can overlap: both the main and interleaved article include the shared page

NO DUPLICATE HANDS ACROSS ARTICLES
====================================
Each hand diagram in the magazine belongs to exactly ONE article. When two articles share
a page, assign each hand to the article it belongs to based on context. Do NOT include the
same hand diagram in multiple articles' page ranges. In Pass 2 (content parsing), each
article will only include hands from its own content.

NEXT-MONTH CONTENT — EXCLUDE (ABSOLUTELY CRITICAL)
=====================================================
Bridge World issues include preview content for the NEXT month near the end of the magazine.
Once you determine the issue's month (e.g. April 1992), EXCLUDE any articles whose titles
reference ANY FUTURE month. Common patterns to ALWAYS exclude:

- "West Hands for the [Month] Bidding Match" — ALWAYS next-month preview, NEVER include
- "East Hands for the [Month] Bidding Match" — ALWAYS next-month preview, NEVER include
- "[Month] Problems" (e.g. "May Problems") — ALWAYS next-month preview
- "[Month] Challenge the Champs" — ALWAYS next-month preview
- "[Month] Bidding Match" — ALWAYS next-month preview
- Any article title containing a month name that is NOT the current issue's month

These are previews for a future issue. Do NOT create articles for them. Do NOT include their
content in any other article. They typically appear in the last few pages of the magazine.

CHALLENGE THE CHAMPS (CTC) — TOC RULES
========================================
CTC articles typically contain 10 deals. Make sure the page range covers ALL deals, not just the
first few. CTC articles can span many pages (often 10-20+ pages). Look carefully at the page headers
to find where the CTC article truly ends — it continues until a different article's title appears.
Do NOT truncate the CTC page range early.
${nextMonthFilter}
CATEGORIES
==========
${CATEGORIES}

TAGGING RULES
=============
${TAGGING_RULES}

IMPORTANT: Do NOT include "content_blocks" in this response. Only return the article metadata listed above. The content will be parsed in a separate step.

${JSON_OUTPUT_RULES}`;
}

// ── Pass 2: Single Article Content ──────────────────────────────────────────

export function buildArticlePrompt(
  articleText: string,
  articleTitle: string,
  authorName: string,
  sourcePage: number,
  articleCategory?: string,
  pdfPages?: number[][],
): string {
  const pdfPageStr = pdfPages
    ? pdfPages.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ")
    : "unknown";

  return `You are parsing one specific article from a Bridge World magazine issue into structured content blocks.

You are extracting ONLY the article titled "${articleTitle}" by ${authorName || "an unknown author"}. The text below contains this article's pages, but those pages may also contain content from other articles. Do NOT include any content from other articles. If you see a different article title, a different author, or content on a clearly different topic, skip it entirely. Extract ONLY content that belongs to "${articleTitle}".

ARTICLE TEXT
============
${articleText}
============

TARGET ARTICLE
==============
Title: "${articleTitle}"
Author: "${authorName}"
Category: "${articleCategory || ""}"
Magazine page: ${sourcePage || "unknown"}
PDF pages: ${pdfPageStr}

The text includes "───── PDF PAGE N ─────" markers showing page boundaries. Only include content from the pages listed above. Text on shared pages may belong to a different article — use the article title, context, and page markers to determine ownership.

RESPONSE FORMAT
===============
Return a JSON object with exactly one key:
{
  "content_blocks": [ ... ]
}

CONTENT BLOCK TYPES
===================

TextBlock:
{
  "id": "<unique-id>",
  "type": "text",
  "data": { "text": "<markdown text>" }
}
- Use **bold** for headings and emphasis within articles.
- Use '' (two single quotes) for apostrophes where they appear in the original text.
- Preserve paragraph breaks as \\n\\n in the text field.

BridgeHandBlock:
{
  "id": "<unique-id>",
  "type": "bridgeHand",
  "data": {
    "hands": {
      "north": { "S": "<spades>", "H": "<hearts>", "D": "<diamonds>", "C": "<clubs>" },
      "south": { "S": "...", "H": "...", "D": "...", "C": "..." },
      "east":  { "S": "...", "H": "...", "D": "...", "C": "..." },
      "west":  { "S": "...", "H": "...", "D": "...", "C": "..." }
    },
    "visibleHands": { "north": true, "south": true, "east": true, "west": true },
    "dealer": "North",
    "vulnerability": "None",
    "contract": "4S",
    "lead": "HK",
    "title": "Deal 1"
  }
}
- Card holdings: Use "T" (NOT "10") for tens. E.g. "AKT63".
- Use "" for empty suits (void).
- Each VISIBLE hand MUST have EXACTLY 13 cards. Count carefully.
- Set visibleHands to false for any hand NOT shown in the original.
- For hands not shown, set that hand's cards to { "S": "", "H": "", "D": "", "C": "" }.
- dealer: "North", "South", "East", "West", or "" if not stated.
- vulnerability: "None", "N-S", "E-W", "All", or "" if not stated.
- contract: e.g. "4S", "3NT", "6H", or "" if not stated.
- lead: e.g. "HK", "S4", "DA", or "" if not stated.

BiddingTableBlock:
{
  "id": "<unique-id>",
  "type": "biddingTable",
  "data": {
    "dealer": "West",
    "bids": [
      { "text": "1H", "alert": null },
      { "text": "Pass", "alert": null },
      { "text": "2C", "alert": "artificial, game-forcing" },
      { "text": "Pass", "alert": null }
    ],
    "label": "Table 1",
    "players": { "west": "Zia", "north": "Hamman", "east": "Rosenberg", "south": "Wolff" }
  }
}
- Standard bid abbreviations: Pass, Dbl, Rdbl, 1C, 1D, 1H, 1S, 1NT, 2C, ... 7NT.
- Include ALL four seats' bids in order starting from the dealer.
- Use null for alert if no alert/explanation is needed.
- "label" is OPTIONAL — use it when the magazine labels the auction (e.g. "Table 1", "Table 2", "Open Room", "Closed Room").
- "players" is OPTIONAL — use it when player names are shown with the auction. Keys are lowercase directions: "west", "north", "east", "south".
- "seats" is OPTIONAL — when set, the renderer shows only these columns (e.g. ["west", "east"] for 2-player CTC format). Opponent bids are shown inline between the primary players' bids. Use this for CTC auctions.
- In tournament reports, a single hand diagram is typically followed by TWO labeled auction tables. Produce separate BiddingTableBlock for each table.
- "ALL PASS" EXPANSION: When a bidding sequence ends with "All Pass" or "(All Pass)", you MUST expand it into individual Pass bids. Every completed auction ends with exactly three consecutive "Pass" bids after the last non-pass action. Never use "All Pass" as a bid text — always write three separate { "text": "Pass", "alert": null } entries. For example, if the last real bid is by North, you need Pass (East), Pass (South), Pass (West).
- Exception: Bidding PROBLEMS end with "?" as the last entry — do NOT add passes after "?". Use { "text": "?", "alert": null } as the final bid.

MSCResultsBlock:
{
  "id": "<unique-id>",
  "type": "mscResults",
  "data": {
    "results": [
      { "action": "1NT", "score": 100, "votes": 45 },
      { "action": "1S", "score": 90, "votes": 30 },
      { "action": "Pass", "score": 60, "votes": 12 }
    ]
  }
}
- Use this block for Master Solvers' Club results tables and Challenge the Champs scoring tables.
- "action" is the bid or play in standard abbreviation form.
- "score" is the numerical score awarded.
- "votes" is the number of panelists who chose that action.

VISIBILITY RULES BY CATEGORY
=============================
Apply these rules based on the article's category/type:

FOR PROBLEM SECTIONS (the initial presentation of each problem):
- "Test Your Play" / "Improve Your Play": Show North + South ONLY (set east/west visibleHands to false)
- "Test Your Defense" / "Improve Your Defense": Show North + one defender (East or West, whichever the text addresses) — set the other two hands to not visible

FOR SOLUTION SECTIONS (the analysis/answer to each problem):
- Show ALL 4 hands visible (north, south, east, west all true) so readers can see the complete deal
- The solution section's hand diagram should be a SEPARATE BridgeHandBlock from the problem section's hand
- This means each problem+solution pair may have TWO hand blocks: one partial (problem) and one full (solution)

These visibility rules override any other visibility logic for these categories.

MSC FORMAT (Master Solvers' Club)
=================================
MSC articles contain 8 problems labeled A through H:
- Problems A-G: bidding problems showing South's hand, a partial auction ending with "?", and the question "What call do you make?"
  - Create a BridgeHandBlock with ONLY South visible (north/east/west all false)
  - Create a BiddingTableBlock ending with "?" (no trailing passes)
  - After commentary text, create an MSCResultsBlock with the scoring table
- Problem H: typically an opening lead problem with a complete auction
  - Show the full auction in a BiddingTableBlock
  - Include the results table as an MSCResultsBlock

CRITICAL MSC HAND PARSING RULES:
- South is ALWAYS the hand holder in MSC. The "?" is ALWAYS South's next bid.
- The auction must place South's bids correctly in the 4-player sequence based on the dealer.
- Each hand MUST be a BridgeHandBlock — do NOT also include the hand as inline text. Only one representation per hand.
- SUIT SYMBOL DELIMITERS: In the extracted PDF text, suit symbols (♠ ♥ ♦ ♣) or their
  text equivalents act as DELIMITERS between suits. The cards AFTER a suit symbol belong
  to THAT suit, NOT the previous one. Parse carefully:
  - ♠ or "Spades:" → next cards are Spades (S)
  - ♥ or "Hearts:" → next cards are Hearts (H)
  - ♦ or "Diamonds:" → next cards are Diamonds (D)
  - ♣ or "Clubs:" → next cards are Clubs (C)
  Example: "♠ A K 7 3 ♥ Q 8 ♦ J T 9 5 ♣ K 6 2" → S: "AK73", H: "Q8", D: "JT95", C: "K62"
- If the PDF text shows holdings separated by spaces, the suit symbol tells you which suit
  the following cards belong to. Do NOT assign cards to the wrong suit.
- Count the total cards carefully — each visible MSC hand MUST have exactly 13 cards.
- STOP AT CURRENT MONTH: If you encounter problems labeled for a FUTURE month (e.g. "May Problems"
  in an April issue), STOP. Do not include them — they are previews for the next issue.

CTC FORMAT (Challenge the Champs)
==================================
CTC articles show hands from East-West perspective:
- Hands show East + West ONLY (set north/south visibleHands to false)
- CTC articles contain 10 deals. Parse ALL 10 deals — do NOT stop early.
- Each deal typically has 3 auctions: two from named competing pairs and one BWS (Bridge World Standard) auction
- Create separate BiddingTableBlock for each auction

CTC AUCTION FORMAT — TWO-PLAYER (CRITICAL):
CTC auctions are between two competing players who are ALWAYS West and East.
Use the 2-player auction format with the "seats" field:

{
  "type": "biddingTable",
  "data": {
    "dealer": "West",
    "bids": [
      { "text": "1H", "alert": null },
      { "text": "Pass", "alert": null },
      { "text": "2C", "alert": null },
      { "text": "Pass", "alert": null }
    ],
    "label": "Zia – Rosenberg",
    "players": { "west": "Zia", "east": "Rosenberg" },
    "seats": ["west", "east"]
  }
}

- ALWAYS set "seats": ["west", "east"] for CTC auctions. This renders a 2-column table
  showing only West and East. Opponent (N/S) bids are shown as parenthesized annotations.
- Still include ALL four seats' bids in the "bids" array (starting from dealer).
  The renderer extracts the opponent bids automatically.
- The LEFT column in the magazine is WEST, the RIGHT column is EAST.
- Parenthesized bids in the magazine (opponent bids) are North or South.
- "label" should be the pair name (e.g. "Zia – Rosenberg") or "BWS Auction".
- "players" should map: { "west": "Player A", "east": "Player B" }
- The BWS Auction also uses "seats": ["west", "east"] with "label": "BWS Auction".

CTC SCORING AND RUNNING TOTAL — CRITICAL:
- After each deal's commentary, include the awards/scoring as an MSCResultsBlock if it's
  a structured table, or as TextBlock if free-form.
- RUNNING MATCH SCORE: After EVERY deal's awards section, include a TextBlock showing the
  cumulative running match score for both pairs. Format:
  "**Score: [Pair A]: X, [Pair B]: Y**"
  This MUST appear after EVERY deal, not just at the end. Track the running total as you go.

- SUIT SYMBOL DELIMITERS apply here too (same as MSC): ♠ ♥ ♦ ♣ delimit suit holdings
- STOP AT CURRENT MONTH: If you encounter content for a FUTURE month (e.g. "West Hands for the May Bidding Match" in an April issue), STOP. Do not include it.

PLAYING SUIT COMBINATIONS FORMAT
=================================
"Playing Suit Combinations" articles show single-suit holdings, NOT full 4-hand diagrams.
They display a single suit across North and South, like:

   NORTH
   A J T 3
   SOUTH
   K 7 5 2

Do NOT use BridgeHandBlock for these. Instead, render them as TextBlock preserving the
North/South two-line layout:
{
  "type": "text",
  "data": { "text": "**NORTH**\\nA J T 3\\n**SOUTH**\\nK 7 5 2" }
}

Only use BridgeHandBlock when full compass-diagram hands (with all 4 suits per hand) are shown.

BRIDGE WORLD FORMAT PATTERNS
============================

PDF SUIT SYMBOL ENCODING:
Bridge World PDFs use a custom font for suit symbols. During text extraction, these symbols
may appear as Unicode suit characters (♠ ♥ ♦ ♣) OR as single digits from the font encoding.
The text has been pre-processed to replace known digit encodings with Unicode symbols, but
some may remain. If you see isolated digits 5-8 where suit symbols should be:
  8 → ♠ (spades), 5 → ♥ (hearts), 7 → ♦ (diamonds), 6 → ♣ (clubs)
For example: "8 K 10 8 7 3 5 K 2 7 A J 3 6 10 3 2" means "♠KT873 ♥K2 ♦AJ3 ♣T32".
In auctions: "1 6" = 1♣, "2 8" = 2♠, "1 5" = 1♥, etc.

PARTIAL HANDS:
The magazine frequently shows only 2 hands. Set visibleHands to false for hidden seats. Use empty strings for hidden hands. Only visible hands need 13-card validation.

TWO-PLAYER AUCTION FORMAT:
Auctions sometimes appear as a two-column layout for one partnership, with opponent bids in parentheses. ALWAYS expand these to full four-player format. Fill in implied passes.

INLINE HANDS IN TEXT:
Hands shown inline in prose (e.g. "partner had, SQJ109764 HQ3 D7 CA83") stay as text in a TextBlock. Only create BridgeHandBlock for compass/diagram-format hands.

PROBLEM/SOLUTION INTERLEAVING — CRITICAL
==========================================
When an article contains BOTH problems and solutions (on separate pages or sections), you MUST
interleave each solution immediately after its corresponding problem. Match by problem number or letter.

CORRECT order:
  Problem 1 intro text → Problem 1 hand → **Solution 1** text
  Problem 2 intro text → Problem 2 hand → **Solution 2** text
  Problem 3 intro text → Problem 3 hand → **Solution 3** text

WRONG order (do NOT do this):
  Problem 1 → Problem 2 → Problem 3 → Solution 1 → Solution 2 → Solution 3

This applies to: New Critical Moments, Test Your Play, Improve Your Play, Improve Your Defense,
Test Your Defense, Playing Suit Combinations, and any similar problem/solution article.

Even though problems and solutions appear on different pages in the PDF, combine them per-problem
in the output. Match "Problem 1" / "1." with "Solution 1" / "1.", "Problem A" with "Solution A", etc.

SOLUTION LABELING — REQUIRED:
Each solution section MUST start with a TextBlock whose text begins with a bold header:
- For lettered problems: **Solution A**, **Solution B**, etc.
- For numbered problems: **Solution 1**, **Solution 2**, etc.
- For named problems: **Solution to [Problem Name]**
Example: { "type": "text", "data": { "text": "**Solution 1**\n\nThe correct play is..." } }
This header is MANDATORY — the system uses it to create collapsible solution panels.

CRITICAL RULES
==============
1. Transcribe EVERY paragraph of this article's text. Do NOT summarize or skip content.
2. Every FULL hand diagram (compass/diagram format with all 4 suits) MUST become a BridgeHandBlock.
3. Every bidding sequence MUST become a BiddingTableBlock, expanded to full four-player format.
4. Every visible hand MUST total EXACTLY 13 cards.
5. Preserve the order of content EXACTLY as it appears, EXCEPT for problem/solution interleaving (see above).
6. Generate unique IDs for each block (use format "b1", "b2", "b3", etc.).
7. If a hand diagram is followed by a bidding sequence, output the BridgeHandBlock first, then the BiddingTableBlock.
8. Inline hands in text stay as text — do NOT extract them as BridgeHandBlock.
9. ONLY parse the article titled "${articleTitle}". Do NOT include any content from other articles that appear on shared pages. If you see content with a different title, different author, or different topic, skip it entirely.
10. NO DUPLICATE HANDS: A hand diagram belongs to exactly one article. Only include hands that are part of THIS article's content. If the text excerpt contains hands from an adjacent article, do NOT include them.
11. NEXT-MONTH CONTENT: If you encounter content for a future month (e.g. "May Problems" in an April issue, "West Hands for the May Bidding Match", "East Hands for the May Bidding Match"), STOP immediately. Do NOT include any of it. This is preview content for the next issue.
12. IGNORE all running headers and footers. "The Bridge World", the issue date (e.g. "January 1998"), and page numbers are NOT article content. Never include them as text blocks.

${JSON_OUTPUT_RULES}`;
}

// ── Image-based article prompt (vision API) ───────────────────────────────
// Simpler, more focused prompt for when we send page images instead of text.
// Avoids the "ARTICLE TEXT" section that confused Claude when no text was present.

export function buildImageArticlePrompt(
  articleTitle: string,
  authorName: string,
  sourcePage: number,
  articleCategory: string,
  pdfPages: number[][],
  batchInfo?: { batchNum: number; totalBatches: number; pageNums: number[] },
): string {
  const pdfPageStr = pdfPages
    .map(([s, e]) => s === e ? `${s}` : `${s}-${e}`)
    .join(", ");

  const catLower = (articleCategory || "").toLowerCase();
  const isMsc = catLower.includes("master solvers") || catLower.includes("msc");
  const isCtc = catLower.includes("challenge the champs") || catLower.includes("ctc");
  const isProblemArticle = [
    "test your play", "improve your play", "test your defense",
    "improve your defense", "playing suit combinations", "new critical moments",
  ].some(p => catLower.includes(p));

  const batchNote = batchInfo && batchInfo.totalBatches > 1
    ? `\nThis is batch ${batchInfo.batchNum} of ${batchInfo.totalBatches} (pages ${batchInfo.pageNums.join(", ")}). ${batchInfo.batchNum > 1 ? "Continue from where the previous batch left off — do NOT duplicate content blocks you already produced." : "The article continues in subsequent batches."}\n`
    : "";

  // Category-specific rules — only include what's relevant
  let categoryRules = "";

  if (isMsc) {
    categoryRules = `
MSC-SPECIFIC RULES:
- 8 problems labeled A through H.
- Problems A-G: bidding problems. Show ONLY South's hand (north/east/west visibleHands = false).
  Auction ends with "?" (no trailing passes). After commentary, include MSCResultsBlock.
- Problem H: typically an opening lead problem with a complete auction.
- Each solution section MUST start with "**Solution [letter]**".
- STOP if you encounter problems for a FUTURE month.`;
  }

  if (isCtc) {
    categoryRules = `
CTC-SPECIFIC RULES:
- Hands show East + West ONLY (north/south visibleHands = false).
- 10 deals. Parse ALL 10 — do NOT stop early.
- Each deal has 2-3 auctions. Use 2-player format: "seats": ["west", "east"].
- "label" = pair name (e.g. "Zia – Rosenberg") or "BWS Auction".
- "players" = { "west": "Name", "east": "Name" }.
- Include ALL four seats' bids in order starting from dealer; the renderer handles display.
- After each deal's awards, include running match score: "**Score: [Pair A]: X, [Pair B]: Y**"
- STOP if you encounter content for a FUTURE month (e.g. "West Hands for May").`;
  }

  if (isProblemArticle && !isMsc && !isCtc) {
    const isDefense = catLower.includes("defense");
    categoryRules = `
PROBLEM ARTICLE RULES:
- Problem hands: Show ${isDefense ? "North + one defender (East or West)" : "North + South ONLY"}. Hide other hands.
- Solution hands: Show ALL 4 hands.
- Each solution section MUST start with a TextBlock beginning with "**Solution [number/letter]**".
- Interleave: Problem 1 → Solution 1 → Problem 2 → Solution 2 (NOT all problems then all solutions).`;
  }

  const ctcSeats = isCtc ? ', "seats": ["west", "east"]' : "";

  const lines = [
    "You are transcribing a Bridge World magazine article from page images into structured JSON content blocks.",
    "",
    `ARTICLE: "${articleTitle}" by ${authorName || "unknown"} (Category: ${articleCategory || "unknown"})`,
    `Magazine page: ${sourcePage || "unknown"} | PDF pages: ${pdfPageStr}`,
    batchNote,
    "CRITICAL INSTRUCTIONS:",
    `1. TRANSCRIBE text EXACTLY as shown in the images. Do NOT paraphrase, summarize, or fabricate content.`,
    "2. Read every word, every card, every bid directly from the page images. If you cannot read something clearly, use your best judgment but do NOT invent content.",
    "3. Every hand diagram becomes a BridgeHandBlock. Every bidding sequence becomes a BiddingTableBlock. Everything else becomes a TextBlock.",
    "4. Each visible hand MUST have EXACTLY 13 cards. Count each suit carefully from the image.",
    '5. Use "T" (not "10") for tens in card holdings.',
    `6. You are extracting ONLY the article titled "${articleTitle}". Do NOT include any content from other articles that appear on shared pages. If you see content that clearly belongs to a different article (different title, different author, different topic), skip it entirely. Each page may contain content from multiple articles — extract ONLY what belongs to "${articleTitle}".`,
    '7. Remove page cross-references like "Solution on page XX", "see page XX", "continued on page XX" — these are print artifacts.',
    '8. IGNORE all running headers and footers on every page. These include: the magazine name "The Bridge World", the issue date (e.g. "January 1998"), and page numbers. These are NOT article content — never include them as text blocks.',
    categoryRules,
    "",
    "CONTENT BLOCK TYPES:",
    "",
    'TextBlock: { "id": "b1", "type": "text", "data": { "text": "**Heading**\\n\\nParagraph text..." } }',
    "- Use **bold** for headings. Preserve paragraph breaks as \\n\\n.",
    "",
    'BridgeHandBlock: { "id": "b2", "type": "bridgeHand", "data": {',
    '  "hands": {',
    '    "north": { "S": "AKT63", "H": "Q8", "D": "JT95", "C": "K6" },',
    '    "south": { "S": "...", "H": "...", "D": "...", "C": "..." },',
    '    "east": { "S": "", "H": "", "D": "", "C": "" },',
    '    "west": { "S": "", "H": "", "D": "", "C": "" }',
    "  },",
    '  "visibleHands": { "north": true, "south": true, "east": false, "west": false },',
    '  "dealer": "North", "vulnerability": "None", "contract": "4S", "lead": "HK", "title": ""',
    "} }",
    "- Set visibleHands false + empty strings for hidden hands.",
    '- dealer/vulnerability/contract/lead: use "" if not shown.',
    "",
    'BiddingTableBlock: { "id": "b3", "type": "biddingTable", "data": {',
    '  "dealer": "West",',
    "  \"bids\": [",
    '    { "text": "1H", "alert": null }, { "text": "Pass", "alert": null },',
    '    { "text": "2C", "alert": null }, { "text": "Pass", "alert": null }',
    "  ],",
    `  "label": "", "players": {}${ctcSeats}`,
    "} }",
    "- Standard abbreviations: Pass, Dbl, Rdbl, 1C-7NT.",
    "- Expand \"All Pass\" into three separate Pass bids.",
    '- Bidding problems end with { "text": "?", "alert": null }.',
    "",
    'MSCResultsBlock: { "id": "b4", "type": "mscResults", "data": {',
    '  "results": [{ "action": "1NT", "score": 100, "votes": 45 }]',
    "} }",
    "",
    'RESPONSE: Return ONLY a JSON object: { "content_blocks": [ ... ] }',
    'Generate sequential IDs: "b1", "b2", "b3", etc.',
    "",
    JSON_OUTPUT_RULES,
  ];

  return lines.join("\n");
}
