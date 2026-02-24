/**
 * Shared post-processing functions for Bridge World content blocks.
 * Used by both the API import route and the standalone CLI parser.
 */

import type {
  ContentBlock,
  BridgeHandBlock,
  PlayHandBlock,
  BiddingTableBlock,
  SolutionBlock,
} from "@/types";

// Re-export MONTH_NAMES so consumers don't need a separate import
export { MONTH_NAMES } from "@/lib/importPrompt";
import { MONTH_NAMES } from "@/lib/importPrompt";

// ── TocArticle type (shared between route and CLI) ──────────────────────────

export interface TocArticle {
  title: string;
  author_name: string;
  category: string;
  tags: string[];
  source_page: number;
  pdf_pages: number[][];
  excerpt: string;
  interleaved?: boolean;           // true if embedded mid-page in another article
  parent_article?: string;         // title of the parent/containing article
  solution_page_ranges?: number[][]; // page ranges that are solution sections
}

// ── Known problem/solution pairs ────────────────────────────────────────────

export const KNOWN_PAIRS = [
  "test your play",
  "improve your play",
  "test your defense",
  "improve your defense",
  "playing suit combinations",
  "new critical moments",
];

// ── Normalize "10" → "T" in content blocks ─────────────────────────────────

export function normalizeTens(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === "bridgeHand") {
      const hands = block.data.hands;
      let changed = false;
      const newHands = { ...hands };
      for (const dir of ["north", "south", "east", "west"] as const) {
        const hand = hands[dir];
        if (!hand) continue;
        const newHand = {
          S: (hand.S || "").replace(/10/g, "T"),
          H: (hand.H || "").replace(/10/g, "T"),
          D: (hand.D || "").replace(/10/g, "T"),
          C: (hand.C || "").replace(/10/g, "T"),
        };
        if (newHand.S !== hand.S || newHand.H !== hand.H || newHand.D !== hand.D || newHand.C !== hand.C) {
          newHands[dir] = newHand;
          changed = true;
        }
      }
      if (changed) {
        return { ...block, data: { ...block.data, hands: newHands } } as BridgeHandBlock;
      }
    }
    if (block.type === "playHand") {
      const hands = block.data.hands;
      let changed = false;
      const newHands = { ...hands };
      for (const dir of ["north", "south", "east", "west"] as const) {
        const hand = hands[dir];
        if (!hand) continue;
        const newHand = {
          S: (hand.S || "").replace(/10/g, "T"),
          H: (hand.H || "").replace(/10/g, "T"),
          D: (hand.D || "").replace(/10/g, "T"),
          C: (hand.C || "").replace(/10/g, "T"),
        };
        if (newHand.S !== hand.S || newHand.H !== hand.H || newHand.D !== hand.D || newHand.C !== hand.C) {
          newHands[dir] = newHand;
          changed = true;
        }
      }
      if (changed) {
        return { ...block, data: { ...block.data, hands: newHands } } as PlayHandBlock;
      }
    }
    if (block.type === "biddingTable") {
      const bids = block.data.bids ?? [];
      const newBids = bids.map((b) => {
        const newText = (b.text || "").replace(/10/g, "T");
        return newText !== b.text ? { ...b, text: newText } : b;
      });
      if (newBids.some((b, i) => b !== bids[i])) {
        return { ...block, data: { ...block.data, bids: newBids } } as BiddingTableBlock;
      }
    }
    return block;
  });
}

// ── Fix MSC auctions: ensure "?" is on South's seat ─────────────────────────

const SEAT_ORDER = ["south", "west", "north", "east"] as const;

function seatIndex(dealer: string): number {
  const d = dealer.toLowerCase();
  const idx = SEAT_ORDER.indexOf(d as typeof SEAT_ORDER[number]);
  return idx >= 0 ? idx : 0; // default to South if unknown
}

/**
 * In MSC articles, bidding problems always end with "?" as South's bid.
 * If the "?" landed on the wrong seat, move it to the correct position by
 * adding/removing Pass bids so "?" falls on South's turn.
 */
export function fixMscAuctions(blocks: ContentBlock[]): { blocks: ContentBlock[]; fixes: string[] } {
  const fixes: string[] = [];

  const fixed = blocks.map((block) => {
    if (block.type !== "biddingTable") return block;

    const bids = block.data.bids;
    if (bids.length === 0) return block;

    // Only fix auctions that end with "?"
    const lastBid = bids[bids.length - 1];
    if (lastBid.text !== "?") return block;

    const dealer = block.data.dealer || "";
    if (!dealer) return block;

    // Figure out which seat the "?" currently falls on
    const dealerIdx = seatIndex(dealer);
    const lastBidSeat = SEAT_ORDER[(dealerIdx + bids.length - 1) % 4];

    if (lastBidSeat === "south") return block; // Already correct

    // Calculate how many Pass bids to insert before "?" so it lands on South
    const southIdx = SEAT_ORDER.indexOf("south");
    const currentIdx = SEAT_ORDER.indexOf(lastBidSeat);
    const passesNeeded = (southIdx - currentIdx + 4) % 4;

    if (passesNeeded === 0) return block;

    // Insert Pass bids before the final "?"
    const newBids = [
      ...bids.slice(0, -1),
      ...Array.from({ length: passesNeeded }, () => ({ text: "Pass" as string, alert: null as string | null })),
      lastBid,
    ];

    fixes.push(`Block ${block.id}: moved "?" from ${lastBidSeat} to South (added ${passesNeeded} Pass${passesNeeded > 1 ? "es" : ""})`);

    return {
      ...block,
      data: { ...block.data, bids: newBids },
    } as BiddingTableBlock;
  });

  return { blocks: fixed, fixes };
}

// ── Strip next-month content from within articles ───────────────────────────

/**
 * Removes trailing blocks from an article that contain next-month markers
 * (e.g., "May Problems" at the end of an April MSC article).
 * Only strips blocks from the END of the article — once a non-matching block
 * is found scanning backwards, we stop.
 */
export function stripNextMonthBlocks(
  blocks: ContentBlock[],
  issueMonth: number,
): { blocks: ContentBlock[]; stripped: number } {
  if (!issueMonth || issueMonth < 1 || issueMonth > 12 || blocks.length === 0) {
    return { blocks, stripped: 0 };
  }

  const nextMonth = issueMonth === 12 ? 1 : issueMonth + 1;
  const nextMonthName = MONTH_NAMES[nextMonth].toLowerCase();

  // Patterns that indicate next-month content
  const nextMonthPatterns = [
    new RegExp(`\\b${nextMonthName}\\s+problems?\\b`, "i"),
    new RegExp(`\\bproblems?\\s+for\\s+${nextMonthName}\\b`, "i"),
    new RegExp(`\\b${nextMonthName}\\s+hands?\\b`, "i"),
    new RegExp(`\\bhands?\\s+for\\s+${nextMonthName}\\b`, "i"),
    new RegExp(`\\bnext\\s+month'?s?\\s+problems?\\b`, "i"),
  ];

  function isNextMonthBlock(block: ContentBlock): boolean {
    if (block.type === "text") {
      const text = block.data.text || "";
      return nextMonthPatterns.some((p) => p.test(text));
    }
    return false;
  }

  // Scan backwards from the end to find the cutoff point
  let cutoff = blocks.length;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    // Text blocks with next-month markers → strip
    if (isNextMonthBlock(block)) {
      cutoff = i;
      continue;
    }
    // BridgeHand/BiddingTable blocks after a next-month marker → also strip
    // (these are the actual problem hands for next month)
    if (cutoff < blocks.length && (block.type === "bridgeHand" || block.type === "biddingTable")) {
      cutoff = i;
      continue;
    }
    // Non-matching block found — stop scanning
    break;
  }

  if (cutoff === blocks.length) {
    return { blocks, stripped: 0 };
  }

  return { blocks: blocks.slice(0, cutoff), stripped: blocks.length - cutoff };
}

// ── Strip cross-references (print artifacts) ───────────────────────────────

const CROSS_REF_PATTERNS = [
  /\(?(?:solution|answer|continued|see)\s+(?:on\s+)?page\s+\d+\)?\.?/gi,
  /\(?turn to page\s+\d+\)?\.?/gi,
];

/**
 * Removes page cross-references like "Solution on page 73", "see page 42",
 * "continued on page 55", etc. — these are print artifacts with no meaning
 * in a digital context.
 */
export function stripCrossReferences(
  blocks: ContentBlock[],
): { blocks: ContentBlock[]; stripped: number } {
  let stripped = 0;

  const result = blocks
    .map((block) => {
      if (block.type !== "text") return block;
      let text = block.data.text;
      for (const pattern of CROSS_REF_PATTERNS) {
        // Reset lastIndex since we reuse these patterns
        pattern.lastIndex = 0;
        text = text.replace(pattern, "");
      }
      text = text.replace(/\n{3,}/g, "\n\n").trim();
      if (text !== block.data.text) stripped++;
      if (!text) return null; // Remove empty blocks
      return { ...block, data: { ...block.data, text } };
    })
    .filter((b): b is ContentBlock => b !== null);

  return { blocks: result, stripped };
}

// ── Strip boilerplate text blocks ───────────────────────────────────────────

const BOILERPLATE_PHRASES = [
  "patronize the bookshelf",
  "subscribe to the bridge world",
  "the bridge world bookshelf",
  "bridge world bookshelf",
  "subscription information",
  "subscription rates",
  "advertise in the bridge world",
  "back issues available",
];

/**
 * Removes text blocks that consist entirely of boilerplate magazine text.
 * Only removes blocks where ALL the text content (after stripping whitespace
 * and markdown) matches known boilerplate. Blocks with real mixed content
 * are left untouched.
 */
export function stripBoilerplateBlocks(
  blocks: ContentBlock[],
): { blocks: ContentBlock[]; stripped: number } {
  let stripped = 0;

  const filtered = blocks.filter((block) => {
    if (block.type !== "text") return true;

    const text = (block.data.text || "").trim();
    if (!text) return true; // keep empty blocks (they're harmless)

    // Strip markdown formatting for comparison
    const plain = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\n+/g, " ")
      .trim()
      .toLowerCase();

    // Check if the entire block is just a boilerplate phrase
    const isBoilerplate = BOILERPLATE_PHRASES.some(
      (phrase) => plain === phrase || plain.startsWith(phrase + ".") || plain.startsWith(phrase + "!")
    );

    if (isBoilerplate) {
      stripped++;
      return false;
    }
    return true;
  });

  return { blocks: filtered, stripped };
}

// ── Wrap solution blocks ────────────────────────────────────────────────────

export function wrapSolutionBlock(id: string, solBlocks: ContentBlock[]): SolutionBlock {
  const firstTextBlock = solBlocks.find(b => b.type === "text");
  const labelMatch = firstTextBlock?.type === "text"
    ? firstTextBlock.data.text.match(/\*\*(.+?)\*\*/)?.[1]
    : null;
  const label = labelMatch || `Solution ${id}`;

  return {
    id: `sol-${id.toLowerCase()}`,
    type: "solution",
    data: { label, blocks: solBlocks },
  };
}

// ── Interleave problem/solution blocks ──────────────────────────────────────

export interface InterleaveResult {
  blocks: ContentBlock[];
  reordered: boolean;
  problemCount: number;
  solutionCount: number;
}

export function interleaveProblemSolutions(blocks: ContentBlock[]): InterleaveResult {
  const problemMarkers: { idx: number; id: string }[] = [];
  const solutionMarkers: { idx: number; id: string }[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== "text") continue;

    const fullHead = (block.data.text || "").slice(0, 300);

    // Check solution FIRST
    const solMatch =
      fullHead.match(/\*\*Solutions?\s+(?:to\s+(?:Problem\s+)?)?([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/\*\*Solutions?\s+(?:to\s+)?#?([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/\*\*Solution\s+([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/\*\*Solution\*\*/) ||
      fullHead.match(/\*\*Answer\s+(?:to\s+)?([A-Ha-h]|\d+)\b/i);
    if (solMatch) {
      const solId = solMatch[1]
        ? solMatch[1].toUpperCase()
        : String(problemMarkers.length > 0 ? problemMarkers.length : solutionMarkers.length + 1);
      solutionMarkers.push({ idx: i, id: solId });
      continue;
    }

    // Problem patterns
    const probMatch =
      fullHead.match(/\*\*Problem\s+([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/^\*\*([A-H])\.\*\*/) ||
      fullHead.match(/^\*\*(\d+)\.\*\*/) ||
      fullHead.match(/\*\*Deal\s+([A-Ha-h]|\d+)\b/i);
    if (probMatch) {
      problemMarkers.push({ idx: i, id: probMatch[1].toUpperCase() });
    }
  }

  console.log(`[interleave] Found ${problemMarkers.length} problems, ${solutionMarkers.length} solutions`);

  if (problemMarkers.length === 0 || solutionMarkers.length === 0) {
    return { blocks, reordered: false, problemCount: problemMarkers.length, solutionCount: solutionMarkers.length };
  }

  const firstSolIdx = solutionMarkers[0].idx;
  const lastProbIdx = problemMarkers[problemMarkers.length - 1].idx;
  const needsReorder = firstSolIdx > lastProbIdx;

  if (needsReorder) {
    const firstProbIdx = problemMarkers[0].idx;
    const prefix = blocks.slice(0, firstProbIdx);

    const problemGroups: { id: string; blocks: ContentBlock[] }[] = [];
    for (let pi = 0; pi < problemMarkers.length; pi++) {
      const start = problemMarkers[pi].idx;
      const end = pi + 1 < problemMarkers.length ? problemMarkers[pi + 1].idx : firstSolIdx;
      problemGroups.push({ id: problemMarkers[pi].id, blocks: blocks.slice(start, end) });
    }

    const solutionGroupMap = new Map<string, ContentBlock[]>();
    for (let si = 0; si < solutionMarkers.length; si++) {
      const start = solutionMarkers[si].idx;
      const end = si + 1 < solutionMarkers.length ? solutionMarkers[si + 1].idx : blocks.length;
      solutionGroupMap.set(solutionMarkers[si].id, blocks.slice(start, end));
    }

    const result: ContentBlock[] = [...prefix];
    for (const pg of problemGroups) {
      result.push(...pg.blocks);
      const sol = solutionGroupMap.get(pg.id);
      if (sol) {
        result.push(wrapSolutionBlock(pg.id, sol));
        solutionGroupMap.delete(pg.id);
      }
    }
    for (const [id, solBlocks] of Array.from(solutionGroupMap.entries())) {
      result.push(wrapSolutionBlock(id, solBlocks));
    }

    return { blocks: result, reordered: true, problemCount: problemMarkers.length, solutionCount: solutionMarkers.length };
  } else {
    const solRanges = new Map<number, { id: string; endIdx: number }>();
    for (let si = 0; si < solutionMarkers.length; si++) {
      const start = solutionMarkers[si].idx;
      let end = blocks.length;
      const nextProb = problemMarkers.find(p => p.idx > start);
      if (nextProb) end = Math.min(end, nextProb.idx);
      if (si + 1 < solutionMarkers.length) end = Math.min(end, solutionMarkers[si + 1].idx);
      solRanges.set(start, { id: solutionMarkers[si].id, endIdx: end });
    }

    const result: ContentBlock[] = [];
    let i = 0;
    while (i < blocks.length) {
      const solRange = solRanges.get(i);
      if (solRange) {
        const solBlocks = blocks.slice(i, solRange.endIdx);
        result.push(wrapSolutionBlock(solRange.id, solBlocks));
        i = solRange.endIdx;
      } else {
        result.push(blocks[i]);
        i++;
      }
    }

    return { blocks: result, reordered: false, problemCount: problemMarkers.length, solutionCount: solutionMarkers.length };
  }
}

// ── Merge problem + solution articles at TOC level ──────────────────────────

export function mergeProblemSolutionArticles(tocArticles: TocArticle[]): TocArticle[] {
  const parentByTitle = new Map<string, number>();
  for (let i = 0; i < tocArticles.length; i++) {
    const title = tocArticles[i].title || "";
    if (!title.match(/\bsolutions?\b/i)) {
      parentByTitle.set(title.toLowerCase(), i);
    }
  }

  const merged = new Set<number>();

  for (let i = 0; i < tocArticles.length; i++) {
    const article = tocArticles[i];
    const title = (article.title || "").trim();
    const titleLower = title.toLowerCase();

    const solMatch =
      title.match(/^(.+?)\s+Solutions?$/i) ||
      title.match(/^Solutions?\s+(?:to\s+)?(.+)$/i);
    const isBareSolutions = /^solutions?$/i.test(titleLower);

    if (!solMatch && !isBareSolutions) continue;

    let baseName = solMatch ? solMatch[1].trim().toLowerCase() : "";
    let parentIdx = parentByTitle.get(baseName);

    if (parentIdx === undefined) {
      for (const knownPair of KNOWN_PAIRS) {
        if (titleLower.includes(knownPair) || (baseName && knownPair.includes(baseName))) {
          parentIdx = parentByTitle.get(knownPair);
          if (parentIdx !== undefined) { baseName = knownPair; break; }
        }
      }
    }

    if (parentIdx === undefined && baseName) {
      for (const [parentTitle, pIdx] of Array.from(parentByTitle.entries())) {
        if (parentTitle.includes(baseName) || baseName.includes(parentTitle)) {
          parentIdx = pIdx;
          baseName = parentTitle;
          break;
        }
      }
    }

    if (parentIdx === undefined) {
      for (const knownPair of KNOWN_PAIRS) {
        let kidx = parentByTitle.get(knownPair);
        if (kidx === undefined) {
          for (const [parentTitle, pIdx] of Array.from(parentByTitle.entries())) {
            if (parentTitle.includes(knownPair)) { kidx = pIdx; break; }
          }
        }
        if (kidx !== undefined && Math.abs(kidx - i) <= 5) {
          parentIdx = kidx;
          baseName = knownPair;
          break;
        }
      }
    }

    if (parentIdx !== undefined) {
      // Record the solution pages before merging
      const parent = tocArticles[parentIdx];
      if (!parent.solution_page_ranges) {
        parent.solution_page_ranges = [];
      }
      parent.solution_page_ranges.push(...article.pdf_pages);

      parent.pdf_pages = [
        ...parent.pdf_pages,
        ...article.pdf_pages,
      ].sort((a, b) => a[0] - b[0]);
      console.log(`[merge] Merged "${article.title}" → "${parent.title}" (solution pages: ${article.pdf_pages.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ")})`);
      merged.add(i);
    } else {
      console.log(`[merge] No parent for "${article.title}" (base: "${baseName}")`);
    }
  }

  return merged.size === 0 ? tocArticles : tocArticles.filter((_, i) => !merged.has(i));
}

// ── Filter next-month content ───────────────────────────────────────────────

export function filterNextMonthArticles(tocArticles: TocArticle[], issueMonth: number): TocArticle[] {
  if (!issueMonth || issueMonth < 1 || issueMonth > 12) return tocArticles;

  const nextMonth = issueMonth === 12 ? 1 : issueMonth + 1;
  const nextMonthName = MONTH_NAMES[nextMonth].toLowerCase();

  const filteredPages: number[][] = [];
  const kept: TocArticle[] = [];

  const handsForPattern = /(west|east)\s+hands?\s+for\s/i;
  const nextMonthProblemsPattern = /\bproblems?\s+for\s/i;

  for (const a of tocArticles) {
    const titleLower = a.title.toLowerCase();
    const hasNextMonth = titleLower.includes(nextMonthName);
    const hasHandsFor = handsForPattern.test(a.title);
    const hasProblemsFor = nextMonthProblemsPattern.test(a.title);
    const hasCurrentMonth = titleLower.includes(MONTH_NAMES[issueMonth].toLowerCase());

    if ((hasNextMonth || hasHandsFor || hasProblemsFor) && !hasCurrentMonth) {
      console.log(`[filter] Removed next-month: "${a.title}"`);
      filteredPages.push(...a.pdf_pages);
    } else {
      kept.push(a);
    }
  }

  if (filteredPages.length > 0) {
    const excludedPages = new Set<number>();
    for (const [start, end] of filteredPages) {
      for (let p = start; p <= end; p++) excludedPages.add(p);
    }
    for (const a of kept) {
      a.pdf_pages = clipPageRanges(a.pdf_pages, excludedPages);
    }
  }

  return kept;
}

function clipPageRanges(ranges: number[][], excluded: Set<number>): number[][] {
  const result: number[][] = [];
  for (const [start, end] of ranges) {
    let runStart: number | null = null;
    for (let p = start; p <= end; p++) {
      if (!excluded.has(p)) {
        if (runStart === null) runStart = p;
      } else {
        if (runStart !== null) {
          result.push([runStart, p - 1]);
          runStart = null;
        }
      }
    }
    if (runStart !== null) {
      result.push([runStart, end]);
    }
  }
  return result;
}

// ── Strip author from title ──────────────────────────────────────────────────

/**
 * Strips trailing "by Author Name", "conducted by Author Name",
 * "edited by Author Name" from article titles.
 * Returns the cleaned title and the extracted author name (if any).
 */
export function stripAuthorFromTitle(
  title: string,
  knownAuthor?: string,
): { title: string; extractedAuthor: string | null } {
  // Pattern: title + "conducted by / edited by / by" + author name
  // Author name = 2-5 capitalized words, optionally with initials like "B."
  const pattern = /\s+(?:conducted|edited|moderated|presented)?\s*by\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,4})\s*$/;
  const match = title.match(pattern);
  if (!match) return { title, extractedAuthor: null };

  const extractedAuthor = match[1].trim();
  const cleaned = title.slice(0, match.index!).trim();

  // Sanity check: don't strip if it would leave a very short title
  if (cleaned.length < 3) return { title, extractedAuthor: null };

  // If we have a known author, only strip if the extracted name is similar
  if (knownAuthor && knownAuthor.toLowerCase() !== extractedAuthor.toLowerCase()) {
    // Check if extracted name is a subset/superset of known author
    const extractedLower = extractedAuthor.toLowerCase();
    const knownLower = knownAuthor.toLowerCase();
    if (!knownLower.includes(extractedLower) && !extractedLower.includes(knownLower)) {
      return { title, extractedAuthor: null };
    }
  }

  return { title: cleaned, extractedAuthor };
}

// ── Slug length capping ─────────────────────────────────────────────────────

/**
 * Truncates a slugified string to approximately `maxLen` characters,
 * cutting at a word (hyphen) boundary to avoid partial words.
 */
export function truncateSlug(slug: string, maxLen = 40): string {
  if (slug.length <= maxLen) return slug;
  // Find the last hyphen before maxLen
  const cut = slug.lastIndexOf("-", maxLen);
  if (cut <= 0) return slug.slice(0, maxLen);
  return slug.slice(0, cut);
}

// ── Deduplicate near-identical TOC articles ─────────────────────────────────

/**
 * Normalizes a title for comparison: lowercase, strip punctuation, collapse whitespace.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detects near-duplicate articles in a TOC list and merges them.
 * Two articles are considered duplicates if they share the same category
 * and their normalized titles are very similar (one contains the other,
 * or they differ by ≤ 3 words).
 * The article with more page coverage is kept; the other's pages are merged in.
 */
export function deduplicateTocArticles(tocArticles: TocArticle[]): TocArticle[] {
  const merged = new Set<number>();

  for (let i = 0; i < tocArticles.length; i++) {
    if (merged.has(i)) continue;
    const a = tocArticles[i];
    const normA = normalizeTitle(a.title);
    const wordsA = normA.split(" ");

    for (let j = i + 1; j < tocArticles.length; j++) {
      if (merged.has(j)) continue;
      const b = tocArticles[j];

      // Must share the same category (or both empty)
      if ((a.category || "").toLowerCase() !== (b.category || "").toLowerCase()) continue;

      const normB = normalizeTitle(b.title);

      // Check: one title contains the other
      const isSubset = normA.includes(normB) || normB.includes(normA);

      if (!isSubset) {
        // Check: titles differ by ≤ 3 words (symmetric difference)
        const wordsB = normB.split(" ");
        const setA = new Set(wordsA);
        const setB = new Set(wordsB);
        const diff = [...Array.from(setA).filter(w => !setB.has(w)), ...Array.from(setB).filter(w => !setA.has(w))];
        if (diff.length > 3) continue;
      }

      // Merge: keep the article with more page coverage, absorb the other's pages
      const pagesA = a.pdf_pages.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
      const pagesB = b.pdf_pages.reduce((sum, [s, e]) => sum + (e - s + 1), 0);

      if (pagesA >= pagesB) {
        a.pdf_pages = [...a.pdf_pages, ...b.pdf_pages].sort((x, y) => x[0] - y[0]);
        console.log(`[dedup] Merged "${b.title}" into "${a.title}"`);
        merged.add(j);
      } else {
        b.pdf_pages = [...b.pdf_pages, ...a.pdf_pages].sort((x, y) => x[0] - y[0]);
        console.log(`[dedup] Merged "${a.title}" into "${b.title}"`);
        merged.add(i);
        break; // a is merged away, stop comparing it
      }
    }
  }

  if (merged.size === 0) return tocArticles;
  console.log(`[dedup] Removed ${merged.size} duplicate article(s)`);
  return tocArticles.filter((_, i) => !merged.has(i));
}

// ── Category mapping ────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  "test your play": "Card Play",
  "improve your play": "Card Play",
  "card play": "Card Play",
  "playing suit combinations": "Card Play",
  "test your defense": "Defense",
  "improve your defense": "Defense",
  "defense": "Defense",
  "bidding theory": "Bidding",
  "convention": "Bidding",
  "tournament report": "Tournament Report",
  "swiss match": "Tournament Report",
  "master solvers' club": "Master Solvers' Club",
  "challenge the champs": "Challenge the Champs",
  "letters": "Letters",
  "editorial": "Editorial",
  "history": "History",
  "fifty years ago": "History",
  "book review": "Book Review",
  "at the table": "Feature",
  "bits and pieces": "Feature",
  "another look": "Feature",
};

/**
 * Maps granular parsing categories to consolidated display categories.
 * Returns the input as-is if no mapping exists.
 */
export function mapCategory(rawCategory: string): string {
  const key = rawCategory.trim().toLowerCase();
  return CATEGORY_MAP[key] ?? rawCategory;
}

/**
 * Infers a category from the article title when Claude returns an empty category.
 * Returns null if no match is found.
 */
export function inferCategoryFromTitle(title: string): string | null {
  const t = title.toLowerCase();
  if (/master solvers/i.test(t)) return "Master Solvers' Club";
  if (/challenge the champs/i.test(t)) return "Challenge the Champs";
  if (/test your play/i.test(t)) return "Card Play";
  if (/improve your play/i.test(t)) return "Card Play";
  if (/test your defense/i.test(t)) return "Defense";
  if (/improve your defense/i.test(t)) return "Defense";
  if (/playing suit combinations/i.test(t)) return "Card Play";
  if (/new critical moments/i.test(t)) return "Card Play";
  if (/fifty years ago/i.test(t)) return "History";
  if (/bits and pieces/i.test(t)) return "Feature";
  if (/letters?\s+to\s+the\s+editor/i.test(t) || t === "letters") return "Letters";
  if (/book review/i.test(t)) return "Book Review";
  return null;
}

// ── Skill level inference ───────────────────────────────────────────────────

/**
 * Infers an article's difficulty level from its category and tags.
 */
export function inferLevel(
  category: string,
  tags: string[],
): "beginner" | "intermediate" | "advanced" {
  const catLower = category.toLowerCase();
  const tagSet = new Set(tags.map(t => t.toLowerCase()));

  // Advanced: MSC, CTC, squeeze, endplay, or explicitly tagged
  if (
    catLower.includes("master solvers") ||
    catLower.includes("challenge the champs") ||
    tagSet.has("squeeze") ||
    tagSet.has("endplay") ||
    tagSet.has("advanced")
  ) {
    return "advanced";
  }

  // Beginner: instructional problem columns, letters, book reviews, editorials
  if (
    catLower === "card play" && (tagSet.has("improve your play") || tagSet.has("playing suit combinations")) ||
    catLower === "defense" && tagSet.has("improve your defense") ||
    catLower === "letters" ||
    catLower === "book review" ||
    catLower === "editorial"
  ) {
    return "beginner";
  }

  return "intermediate";
}
