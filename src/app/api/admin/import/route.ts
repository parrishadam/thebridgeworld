import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateProfile } from "@/lib/subscription";
import { buildTocPrompt, buildArticlePrompt, buildImageArticlePrompt, buildTocText, MONTH_NAMES } from "@/lib/importPrompt";
import { validateContentBlocks, autoFixContentBlocks, autoFixAuctions } from "@/lib/validateBlocks";
import type { AutoFixResult, AuctionFixResult } from "@/lib/validateBlocks";
import type { ContentBlock, BridgeHandBlock, PlayHandBlock, BiddingTableBlock, SolutionBlock } from "@/types";
import { jsonrepair } from "jsonrepair";
import {
  stripCrossReferences,
  stripAuthorFromTitle,
  deduplicateTocArticles,
  mapCategory,
  inferCategoryFromTitle,
  inferLevel,
} from "@/lib/postProcess";

export const maxDuration = 300; // Max for Vercel hobby plan (5 minutes)

interface TocArticle {
  title: string;
  author_name: string;
  category: string;
  tags: string[];
  source_page: number;
  pdf_pages: number[][];
  // Legacy fields — auto-converted to pdf_pages if Claude returns old format
  pdf_start_page?: number;
  pdf_end_page?: number;
  pdf_extra_pages?: number[];
  excerpt: string;
}

interface ParsedArticle {
  title: string;
  author_name: string;
  category: string;
  tags: string[];
  level?: string;
  month?: number;
  year?: number;
  source_page: number;
  excerpt: string;
  content_blocks: ContentBlock[];
  _sourceText: string;
}

interface IssueMeta {
  month: number;
  year: number;
  volume: number | null;
  number: number | null;
  title: string;
}

interface ValidationWarning {
  articleIndex: number;
  title: string;
  errors: Array<{
    blockIndex: number;
    blockId: string;
    blockType: string;
    errors: string[];
  }>;
}

interface ArticleParseError {
  articleIndex: number;
  title: string;
  error: string;
}

// ── Usage / cost tracking ───────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
};

interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

interface CallResult {
  text: string;
  usage: CallUsage;
}

interface ImportStats {
  totalDurationMs: number;
  pdfExtractMs: number;
  tocCall: CallUsage;
  articleCalls: Array<{ title: string } & CallUsage>;
  totals: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    apiCalls: number;
  };
}

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-20250514"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DELAY_BETWEEN_CALLS_MS = 3_000;
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_WAIT_MS = 60_000;

const TOC_MODEL = "claude-haiku-4-5-20251001";
const ARTICLE_MODEL_HAIKU = "claude-haiku-4-5-20251001";
const ARTICLE_MODEL_SONNET = "claude-sonnet-4-20250514";

// Categories that need Sonnet (complex structures: hands, auctions, diagrams)
const SONNET_CATEGORIES = new Set([
  "master solvers' club",
  "challenge the champs",
  "tournament report",
  "test your play",
  "improve your play",
  "improve your defense",
  "test your defense",
  "new critical moments",
  "playing suit combinations",
  "swiss match",
  "card play",
  "defense",
]);

/** Pick model based on article category. Sonnet for complex articles, Haiku for text-heavy ones. */
function pickArticleModel(category: string): string {
  const catLower = (category || "").toLowerCase();
  if (SONNET_CATEGORIES.has(catLower)) return ARTICLE_MODEL_SONNET;
  // Fallback: check for partial matches (e.g. "Master Solvers" without the apostrophe)
  const sonnetArr = Array.from(SONNET_CATEGORIES);
  for (const cat of sonnetArr) {
    if (catLower.includes(cat) || cat.includes(catLower)) return ARTICLE_MODEL_SONNET;
  }
  return ARTICLE_MODEL_HAIKU;
}

// Text-only categories that DON'T need image parsing (no hand diagrams or auctions).
// Everything else (articles with hands, auctions, diagrams) uses page images.
const TEXT_ONLY_CATEGORIES = new Set([
  "editorial",
  "letters",
  "history",
  "book review",
  "convention",
  "bits and pieces",
  "fifty years ago",
  "at the table",
  "another look",
]);

function shouldParseWithImages(category: string): boolean {
  const catLower = (category || "").toLowerCase();
  // If exact match on a text-only category, use text extraction
  if (TEXT_ONLY_CATEGORIES.has(catLower)) return false;
  // Partial match check for text-only categories
  const textOnlyArr = Array.from(TEXT_ONLY_CATEGORIES);
  for (const cat of textOnlyArr) {
    if (catLower.includes(cat) || cat.includes(catLower)) return false;
  }
  // Default: use images for everything else (hands, auctions, diagrams)
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call Claude and return the text response plus usage stats. Retries on 429. */
async function callClaude(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropic: any,
  prompt: string,
  model: string,
  maxTokens: number,
): Promise<CallResult> {
  const t0 = Date.now();

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = message.content.find((b: { type: string }) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text response");
      }

      const inputTokens: number = message.usage?.input_tokens ?? 0;
      const outputTokens: number = message.usage?.output_tokens ?? 0;

      return {
        text: textBlock.text,
        usage: {
          model,
          inputTokens,
          outputTokens,
          costUsd: computeCost(model, inputTokens, outputTokens),
          durationMs: Date.now() - t0,
        },
      };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
        const waitMs = RATE_LIMIT_BASE_WAIT_MS * Math.pow(2, attempt);
        console.log(`[import]   ⏳ Rate limited (429). Waiting ${waitMs / 1000}s before retry ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES}...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted rate-limit retries");
}

/**
 * Render specific PDF pages to base64 PNG images using pdftoppm (poppler-utils).
 * Shell-based approach avoids Node.js library compatibility issues.
 * Returns an array of { pageNum, base64 } for each requested page.
 * pageNums are 1-indexed (matching PDF PAGE markers).
 */
async function renderPdfPagesToImages(
  pdfBuffer: Buffer,
  pageNums: number[],
  dpi: number = 200,
): Promise<Array<{ pageNum: number; base64: string }>> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  // Resolve pdftoppm — check local install, then system PATH
  const localBin = path.join(os.homedir(), ".local", "bin", "pdftoppm");
  const localLib = path.join(os.homedir(), ".local", "lib");
  let pdftoppmPath: string;
  try {
    const systemPath = execSync("which pdftoppm 2>/dev/null").toString().trim();
    pdftoppmPath = systemPath;
  } catch {
    if (fs.existsSync(localBin)) {
      pdftoppmPath = localBin;
    } else {
      throw new Error(
        "pdftoppm not found. Install poppler-utils: sudo apt-get install -y poppler-utils",
      );
    }
  }

  // Write PDF to a temp file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-render-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  const results: Array<{ pageNum: number; base64: string }> = [];

  try {
    for (const pageNum of pageNums) {
      const outPrefix = path.join(tmpDir, `page-${pageNum}`);

      // pdftoppm -png -r <dpi> -f <page> -l <page> -singlefile input.pdf outputprefix
      // -singlefile avoids adding page number suffixes
      const cmd = `"${pdftoppmPath}" -png -r ${dpi} -f ${pageNum} -l ${pageNum} -singlefile "${pdfPath}" "${outPrefix}"`;
      const env = { ...process.env, LD_LIBRARY_PATH: localLib };
      execSync(cmd, { env, timeout: 30_000 });

      const pngPath = `${outPrefix}.png`;
      if (!fs.existsSync(pngPath)) {
        console.warn(`[render] pdftoppm produced no output for page ${pageNum}`);
        continue;
      }

      const pngData = fs.readFileSync(pngPath);
      results.push({
        pageNum,
        base64: pngData.toString("base64"),
      });

      // Clean up individual page file immediately
      fs.unlinkSync(pngPath);
    }
  } finally {
    // Clean up temp directory
    try {
      fs.unlinkSync(pdfPath);
      fs.rmdirSync(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  }

  return results;
}

/**
 * Call Claude with image content blocks (vision API).
 * Sends page images + a text prompt. Used for MSC/CTC where text extraction is unreliable.
 */
async function callClaudeWithImages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropic: any,
  images: Array<{ pageNum: number; base64: string }>,
  prompt: string,
  model: string,
  maxTokens: number,
): Promise<CallResult> {
  const t0 = Date.now();

  // Build content blocks: images first, then text prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  for (const img of images) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: img.base64,
      },
    });
  }
  content.push({ type: "text", text: prompt });

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }],
      });

      const textBlock = message.content.find((b: { type: string }) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text response");
      }

      const inputTokens: number = message.usage?.input_tokens ?? 0;
      const outputTokens: number = message.usage?.output_tokens ?? 0;

      return {
        text: textBlock.text,
        usage: {
          model,
          inputTokens,
          outputTokens,
          costUsd: computeCost(model, inputTokens, outputTokens),
          durationMs: Date.now() - t0,
        },
      };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
        const waitMs = RATE_LIMIT_BASE_WAIT_MS * Math.pow(2, attempt);
        console.log(`[import]   ⏳ Rate limited (429). Waiting ${waitMs / 1000}s before retry ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES}...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted rate-limit retries");
}

/** Extract JSON from a Claude response, stripping markdown fences and surrounding text. */
function extractJson<T>(raw: string): T {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json?\s*\n?/m, "").replace(/\n?\s*```\s*$/m, "");
  const jsonStart = cleaned.search(/[{[]/);
  const jsonEndBrace = cleaned.lastIndexOf("}");
  const jsonEndBracket = cleaned.lastIndexOf("]");
  const jsonEnd = Math.max(jsonEndBrace, jsonEndBracket);
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }
  // Strip trailing commas before } and ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch {
    // Second pass: use jsonrepair for malformed output
    try {
      const repaired = jsonrepair(cleaned);
      console.log("[import]   Repaired malformed JSON with jsonrepair");
      return JSON.parse(repaired);
    } catch (repairErr) {
      console.error("[import]   JSON parse failed even after repair");
      throw repairErr;
    }
  }
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/**
 * Slice per-page text for an article given its pdf_pages ranges.
 * Each range gets a ±1 page buffer (clamped to bounds).
 * Multiple ranges are joined with a separator marker so the LLM
 * knows the content comes from different parts of the magazine.
 * Pages are 1-indexed (matching PDF PAGE markers).
 */
function sliceArticleText(
  pageTexts: string[],
  pdfPages: number[][],
): string {
  const totalPages = pageTexts.length;
  const sections: string[] = [];

  for (let ri = 0; ri < pdfPages.length; ri++) {
    const [rangeStart, rangeEnd] = pdfPages[ri];
    // Add 1-page buffer on each side, clamped to valid bounds
    const start = Math.max(0, rangeStart - 1 - 1); // -1 for 0-index, -1 for buffer
    const end = Math.min(totalPages, rangeEnd + 1);  // +1 for buffer (slice is exclusive)

    // Include page markers so Claude knows page boundaries
    const pageSlice = pageTexts.slice(start, end)
      .map((text, i) => `───── PDF PAGE ${start + i + 1} ─────\n${text}`)
      .join("\n\n");

    if (ri === 0) {
      sections.push(pageSlice);
    } else {
      sections.push(`\n\n───── CONTINUATION ─────\n\n${pageSlice}`);
    }
  }

  return sections.join("");
}

/**
 * For long articles, split text into chunks at paragraph boundaries.
 * Each chunk has ~OVERLAP_CHARS of overlap with the previous to avoid losing
 * content that spans a split point.
 */
const CHUNK_MAX_CHARS = 14_000;
const CHUNK_OVERLAP_CHARS = 1_000;

function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_MAX_CHARS) return [text];

  const chunks: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    let end = offset + CHUNK_MAX_CHARS;

    if (end >= text.length) {
      chunks.push(text.slice(offset));
      break;
    }

    // Find a paragraph break near the end to split cleanly
    const searchStart = Math.max(offset + CHUNK_MAX_CHARS - 2000, offset);
    const searchRegion = text.slice(searchStart, end);
    const lastBreak = searchRegion.lastIndexOf("\n\n");
    if (lastBreak !== -1) {
      end = searchStart + lastBreak + 2; // include the \n\n
    }

    chunks.push(text.slice(offset, end));
    // Next chunk starts with overlap before the split point
    offset = Math.max(offset + 1, end - CHUNK_OVERLAP_CHARS);
  }

  return chunks;
}

// ── Pre-processing: detect and replace digit-encoded suit symbols ────────────
// Bridge World PDFs use custom fonts where suit symbols are encoded as single
// digits in text extraction: 8=♠, 5=♥, 7=♦, 6=♣. This function detects and
// replaces them with actual Unicode symbols before sending text to Claude.

const SUIT_DIGIT_MAP: Record<string, string> = { "8": "♠", "5": "♥", "7": "♦", "6": "♣" };
const SUIT_DIGITS = new Set(["5", "6", "7", "8"]);

function preprocessSuitSymbols(text: string): { text: string; replaced: boolean } {
  // First, detect if this PDF uses digit-encoded suits.
  // Look for the pattern "You, South, hold:" followed by a line starting with a suit digit
  // or auction lines where bid denominations are standalone digits 5-8.
  const hasDigitSuits =
    /You,\s+South,\s+hold:\s*\n\s*[5678]\s+[AKQJT2-9]/i.test(text) ||
    /\b[1-7]\s+[5678]\s/g.test(text.slice(0, 2000));

  if (!hasDigitSuits) {
    return { text, replaced: false };
  }

  let result = text;

  // 1. Fix multi-line results tables: "2\n6 100 12" → "2♣ 100 12"
  //    The suit digit ends up on a separate line from the level digit
  result = result.replace(/\b([1-7])\s*\n\s*([5678])\s+(\d+)\s+(\d+)/g,
    (_, level, suit, score, votes) => `${level}${SUIT_DIGIT_MAP[suit]} ${score} ${votes}`);

  // 2. Fix auction bids: "1 6" → "1♣", "2 8" → "2♠"
  //    In auction context (after SOUTH/WEST/NORTH/EAST header or in bid sequences)
  result = result.replace(/\b([1-7])\s+([5678])(?=\s|$)/g,
    (_, level, suit) => `${level}${SUIT_DIGIT_MAP[suit]}`);

  // 3. Fix hand holdings: standalone digit 5-8 followed by card values
  //    "8 K 10 8 7 3" → "♠ K 10 8 7 3" (only the FIRST occurrence in sequence)
  //    The suit symbol digit appears at the START of a suit run, preceded by
  //    start-of-line, whitespace after previous suit's cards, or after "hold:"
  //    Key heuristic: a suit-digit followed by at least one face card (A,K,Q,J,T)
  //    or followed by multiple card values separated by spaces
  result = result.replace(
    /(?<=^|\n|,\s*|\.\s*|\s{2,})([5678])\s+((?:[AKQJT]|10|[2-9])(?:\s+(?:[AKQJT]|10|[2-9]))*)/g,
    (match, suitDigit, cards) => {
      // Only replace if the digit is in our suit map
      if (!SUIT_DIGITS.has(suitDigit)) return match;
      return `${SUIT_DIGIT_MAP[suitDigit]} ${cards}`;
    },
  );

  // 4. Fix isolated suit digits at start of hand lines
  //    "8  A  Q  x      5  Q  x      7  A  x  x  x    6  A  x  x  x"
  //    After multi-space gaps, a suit digit followed by cards
  result = result.replace(
    /(\s{3,})([5678])\s+((?:[AKQJTx]|10|[2-9])(?:\s+(?:[AKQJTx]|10|[2-9]))*)/g,
    (match, spaces, suitDigit, cards) => {
      if (!SUIT_DIGITS.has(suitDigit)) return match;
      return `${spaces}${SUIT_DIGIT_MAP[suitDigit]} ${cards}`;
    },
  );

  return { text: result, replaced: result !== text };
}

// ── Post-processing: normalize "10" → "T" in content blocks ────────────────

function normalizeTens(blocks: ContentBlock[]): ContentBlock[] {
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

// ── Post-processing: merge leftover solution articles (defensive fallback) ───
// The TOC prompt instructs Claude to merge solutions into parent articles,
// but if Claude still creates standalone "[Title] Solutions" articles, this
// fallback merges them using STRICT exact-title matching only.

function mergeProblemSolutionArticles(tocArticles: TocArticle[]): TocArticle[] {
  // Index all non-solution articles by lowercase title
  const parentByTitle = new Map<string, number>();
  for (let i = 0; i < tocArticles.length; i++) {
    const title = tocArticles[i].title || "";
    if (!title.match(/\bsolutions?\b/i)) {
      parentByTitle.set(title.toLowerCase(), i);
    }
  }

  console.log(`[merge] Parent articles: ${Array.from(parentByTitle.keys()).join(", ")}`);

  const merged = new Set<number>();

  // Known problem/solution article pairs
  const KNOWN_PAIRS = [
    "test your play",
    "improve your play",
    "test your defense",
    "improve your defense",
    "playing suit combinations",
    "new critical moments",
  ];

  for (let i = 0; i < tocArticles.length; i++) {
    const article = tocArticles[i];
    const title = (article.title || "").trim();
    const titleLower = title.toLowerCase();

    // Match patterns: "[Title] Solutions", "Solutions to [Title]", "[Title] Solution"
    const solMatch =
      title.match(/^(.+?)\s+Solutions?$/i) ||
      title.match(/^Solutions?\s+(?:to\s+)?(.+)$/i);

    // Also match standalone "Solutions" — try to find the best parent
    const isBareSolutions = /^solutions?$/i.test(titleLower);

    if (!solMatch && !isBareSolutions) continue;

    let baseName = solMatch ? solMatch[1].trim().toLowerCase() : "";
    let parentIdx = parentByTitle.get(baseName);

    // If exact match failed, try fuzzy matching against known pairs
    if (parentIdx === undefined) {
      for (const knownPair of KNOWN_PAIRS) {
        if (titleLower.includes(knownPair) || (baseName && knownPair.includes(baseName))) {
          parentIdx = parentByTitle.get(knownPair);
          if (parentIdx !== undefined) {
            baseName = knownPair;
            break;
          }
        }
      }
    }

    // If still no match, try partial matching against ALL parent titles
    if (parentIdx === undefined && baseName) {
      for (const [parentTitle, pIdx] of Array.from(parentByTitle.entries())) {
        if (parentTitle.includes(baseName) || baseName.includes(parentTitle)) {
          parentIdx = pIdx;
          baseName = parentTitle;
          console.log(`[merge]   Partial match: "${baseName}" found in parent "${parentTitle}"`);
          break;
        }
      }
    }

    // For bare "Solutions" or unmatched, try to find a nearby known-pair article (within 5 positions)
    if (parentIdx === undefined) {
      for (const knownPair of KNOWN_PAIRS) {
        // Check exact title match
        let kidx = parentByTitle.get(knownPair);
        // Also check partial matches in parent titles
        if (kidx === undefined) {
          for (const [parentTitle, pIdx] of Array.from(parentByTitle.entries())) {
            if (parentTitle.includes(knownPair)) {
              kidx = pIdx;
              break;
            }
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
      tocArticles[parentIdx].pdf_pages = [
        ...tocArticles[parentIdx].pdf_pages,
        ...article.pdf_pages,
      ].sort((a, b) => a[0] - b[0]);
      console.log(
        `[import]   🔗 Fallback merge: "${article.title}" → "${tocArticles[parentIdx].title}" — pages: ${JSON.stringify(tocArticles[parentIdx].pdf_pages)}`,
      );
      merged.add(i);
    } else {
      console.log(
        `[import]   ⚠️  Solutions article "${article.title}" has no matching parent (extracted base: "${baseName}"). Keeping as standalone.`,
      );
    }
  }

  if (merged.size === 0) {
    console.log(`[merge] No solution articles to merge.`);
    return tocArticles;
  }

  console.log(`[merge] Merged ${merged.size} solution article(s).`);
  return tocArticles.filter((_, i) => !merged.has(i));
}

// ── Post-processing: interleave problem/solution blocks ─────────────────────
// When Claude returns all problems followed by all solutions, reorder so
// each solution immediately follows its corresponding problem.

interface InterleaveResult {
  blocks: ContentBlock[];
  reordered: boolean;
  problemCount: number;
  solutionCount: number;
}

function interleaveProblemSolutions(blocks: ContentBlock[]): InterleaveResult {
  const problemMarkers: { idx: number; id: string }[] = [];
  const solutionMarkers: { idx: number; id: string }[] = [];

  // Log all text block previews for debugging
  const textPreviews: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== "text") continue;
    const head = (block.data.text || "").slice(0, 200).replace(/\n/g, " ");
    textPreviews.push(`  [${i}] type=${block.type}: "${head}"`);

    const fullHead = (block.data.text || "").slice(0, 300);

    // Check solution FIRST (to avoid "Solution to Problem A" matching as a problem)
    const solMatch =
      fullHead.match(/\*\*Solutions?\s+(?:to\s+(?:Problem\s+)?)?([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/\*\*Solutions?\s+(?:to\s+)?#?([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/\*\*Solution\s+([A-Ha-h]|\d+)\b/i) ||
      // "Solution:" or "Solution" at start of bold text followed by content
      fullHead.match(/\*\*Solution\*\*/) ||
      // "Answer:" pattern used in some articles
      fullHead.match(/\*\*Answer\s+(?:to\s+)?([A-Ha-h]|\d+)\b/i);
    if (solMatch) {
      // If the regex didn't capture a letter/number (e.g. bare "**Solution**"), try to infer from context
      const solId = solMatch[1]
        ? solMatch[1].toUpperCase()
        : String(problemMarkers.length > 0 ? problemMarkers.length : solutionMarkers.length + 1);
      solutionMarkers.push({ idx: i, id: solId });
      continue;
    }

    // Problem patterns: "**Problem A**", "**Problem 1**", "**A.**", "**1.**"
    const probMatch =
      fullHead.match(/\*\*Problem\s+([A-Ha-h]|\d+)\b/i) ||
      fullHead.match(/^\*\*([A-H])\.\*\*/) ||
      fullHead.match(/^\*\*(\d+)\.\*\*/) ||
      fullHead.match(/\*\*Deal\s+([A-Ha-h]|\d+)\b/i);
    if (probMatch) {
      problemMarkers.push({ idx: i, id: probMatch[1].toUpperCase() });
    }
  }

  console.log(`[interleave] ${blocks.length} blocks total. Text block previews:\n${textPreviews.slice(0, 30).join("\n")}`);
  console.log(`[interleave] Found ${problemMarkers.length} problems: ${problemMarkers.map(p => `${p.id}@${p.idx}`).join(", ")}`);
  console.log(`[interleave] Found ${solutionMarkers.length} solutions: ${solutionMarkers.map(s => `${s.id}@${s.idx}`).join(", ")}`);

  // Need at least 1 problem and 1 solution
  if (problemMarkers.length === 0 || solutionMarkers.length === 0) {
    return { blocks, reordered: false, problemCount: problemMarkers.length, solutionCount: solutionMarkers.length };
  }

  // Determine if solutions need reordering (all solutions after all problems)
  // OR if they're already interleaved (solutions between problems)
  const firstSolIdx = solutionMarkers[0].idx;
  const lastProbIdx = problemMarkers[problemMarkers.length - 1].idx;
  const needsReorder = firstSolIdx > lastProbIdx;

  if (needsReorder) {
    // ── Case 1: All solutions come AFTER all problems — reorder and wrap ──
    const firstProbIdx = problemMarkers[0].idx;
    const prefix = blocks.slice(0, firstProbIdx);

    const problemGroups: { id: string; blocks: ContentBlock[] }[] = [];
    for (let pi = 0; pi < problemMarkers.length; pi++) {
      const start = problemMarkers[pi].idx;
      const end = pi + 1 < problemMarkers.length
        ? problemMarkers[pi + 1].idx
        : firstSolIdx;
      problemGroups.push({ id: problemMarkers[pi].id, blocks: blocks.slice(start, end) });
    }

    const solutionGroupMap = new Map<string, ContentBlock[]>();
    for (let si = 0; si < solutionMarkers.length; si++) {
      const start = solutionMarkers[si].idx;
      const end = si + 1 < solutionMarkers.length
        ? solutionMarkers[si + 1].idx
        : blocks.length;
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
    // ── Case 2: Solutions already interleaved — just wrap each in a SolutionBlock in-place ──
    // Build a map of solution marker idx → { id, endIdx }
    const solRanges = new Map<number, { id: string; endIdx: number }>();
    for (let si = 0; si < solutionMarkers.length; si++) {
      const start = solutionMarkers[si].idx;
      // Solution group ends at the next problem or next solution, whichever comes first
      let end = blocks.length;
      // Find next problem after this solution
      const nextProb = problemMarkers.find(p => p.idx > start);
      if (nextProb) end = Math.min(end, nextProb.idx);
      // Find next solution after this solution
      if (si + 1 < solutionMarkers.length) end = Math.min(end, solutionMarkers[si + 1].idx);
      solRanges.set(start, { id: solutionMarkers[si].id, endIdx: end });
    }

    const result: ContentBlock[] = [];
    let i = 0;
    while (i < blocks.length) {
      const solRange = solRanges.get(i);
      if (solRange) {
        // Wrap this range of blocks in a SolutionBlock
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

/** Wrap an array of solution blocks into a single SolutionBlock with a label. */
function wrapSolutionBlock(id: string, solBlocks: ContentBlock[]): SolutionBlock {
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

// ── Post-processing: filter next-month content and clip page ranges ──────────

function filterNextMonthArticles(tocArticles: TocArticle[], issueMonth: number): TocArticle[] {
  if (!issueMonth || issueMonth < 1 || issueMonth > 12) return tocArticles;

  const nextMonth = issueMonth === 12 ? 1 : issueMonth + 1;
  const nextMonthName = MONTH_NAMES[nextMonth].toLowerCase();

  // Identify next-month articles and collect their page ranges
  const filteredPages: number[][] = [];
  const kept: TocArticle[] = [];

  // Patterns that indicate next-month preview content (regardless of month name)
  const handsForPattern = /(west|east)\s+hands?\s+for\s/i;
  const nextMonthProblemsPattern = /\bproblems?\s+for\s/i;

  for (const a of tocArticles) {
    const titleLower = a.title.toLowerCase();
    // Match any title containing the next month name — broad filter
    // Catches: "May Problems", "West Hands for the May Bidding Match",
    // "East Hands for May", "May Bidding Match", "May Challenge", etc.
    const hasNextMonth = titleLower.includes(nextMonthName);
    // Catch "West Hands for" / "East Hands for" patterns — these are ALWAYS previews
    const hasHandsFor = handsForPattern.test(a.title);
    // Catch "Problems for" patterns
    const hasProblemsFor = nextMonthProblemsPattern.test(a.title);
    // Don't filter if the title also contains the CURRENT month (it's this issue's content)
    const hasCurrentMonth = titleLower.includes(MONTH_NAMES[issueMonth].toLowerCase());

    if ((hasNextMonth || hasHandsFor || hasProblemsFor) && !hasCurrentMonth) {
      console.log(`[import]   🚫 Filtered next-month article: "${a.title}" — pages: ${JSON.stringify(a.pdf_pages)} (next=${hasNextMonth}, handsFor=${hasHandsFor}, problemsFor=${hasProblemsFor})`);
      filteredPages.push(...a.pdf_pages);
    } else {
      kept.push(a);
    }
  }

  // Clip remaining articles' page ranges to exclude filtered pages
  if (filteredPages.length > 0) {
    // Build a set of excluded page numbers
    const excludedPages = new Set<number>();
    for (const [start, end] of filteredPages) {
      for (let p = start; p <= end; p++) {
        excludedPages.add(p);
      }
    }

    for (const a of kept) {
      const originalPages = JSON.stringify(a.pdf_pages);
      a.pdf_pages = clipPageRanges(a.pdf_pages, excludedPages);
      if (JSON.stringify(a.pdf_pages) !== originalPages) {
        console.log(
          `[import]   ✂️  Clipped "${a.title}" pages: ${originalPages} → ${JSON.stringify(a.pdf_pages)}`,
        );
      }
    }
  }

  return kept;
}

/**
 * Remove excluded pages from page ranges, splitting ranges as needed.
 * Example: [[65, 76]] with excluded {75, 76} → [[65, 74]]
 */
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

// ── Fix MSC auctions: ensure "?" is on South's seat ─────────────────────────

const MSC_SEAT_ORDER = ["south", "west", "north", "east"] as const;

function mscSeatIndex(dealer: string): number {
  const d = dealer.toLowerCase();
  const idx = MSC_SEAT_ORDER.indexOf(d as typeof MSC_SEAT_ORDER[number]);
  return idx >= 0 ? idx : 0;
}

function fixMscAuctions(blocks: ContentBlock[]): { blocks: ContentBlock[]; fixes: string[] } {
  const fixes: string[] = [];
  const fixed = blocks.map((block) => {
    if (block.type !== "biddingTable") return block;
    const bids = block.data.bids;
    if (bids.length === 0) return block;
    const lastBid = bids[bids.length - 1];
    if (lastBid.text !== "?") return block;
    const dealer = block.data.dealer || "";
    if (!dealer) return block;
    const dealerIdx = mscSeatIndex(dealer);
    const lastBidSeat = MSC_SEAT_ORDER[(dealerIdx + bids.length - 1) % 4];
    if (lastBidSeat === "south") return block;
    const southIdx = MSC_SEAT_ORDER.indexOf("south");
    const currentIdx = MSC_SEAT_ORDER.indexOf(lastBidSeat);
    const passesNeeded = (southIdx - currentIdx + 4) % 4;
    if (passesNeeded === 0) return block;
    const newBids = [
      ...bids.slice(0, -1),
      ...Array.from({ length: passesNeeded }, () => ({ text: "Pass" as string, alert: null as string | null })),
      lastBid,
    ];
    fixes.push(`Block ${block.id}: moved "?" from ${lastBidSeat} to South (added ${passesNeeded} Pass${passesNeeded > 1 ? "es" : ""})`);
    return { ...block, data: { ...block.data, bids: newBids } } as BiddingTableBlock;
  });
  return { blocks: fixed, fixes };
}

// ── Strip next-month content from within articles ───────────────────────────

function stripNextMonthBlocks(
  blocks: ContentBlock[],
  issueMonth: number,
): { blocks: ContentBlock[]; stripped: number } {
  if (!issueMonth || issueMonth < 1 || issueMonth > 12 || blocks.length === 0) {
    return { blocks, stripped: 0 };
  }
  const nextMonth = issueMonth === 12 ? 1 : issueMonth + 1;
  const nextMonthName = MONTH_NAMES[nextMonth].toLowerCase();
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
  let cutoff = blocks.length;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (isNextMonthBlock(block)) { cutoff = i; continue; }
    if (cutoff < blocks.length && (block.type === "bridgeHand" || block.type === "biddingTable")) { cutoff = i; continue; }
    break;
  }
  if (cutoff === blocks.length) return { blocks, stripped: 0 };
  return { blocks: blocks.slice(0, cutoff), stripped: blocks.length - cutoff };
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

function stripBoilerplateBlocks(
  blocks: ContentBlock[],
): { blocks: ContentBlock[]; stripped: number } {
  let stripped = 0;
  const filtered = blocks.filter((block) => {
    if (block.type !== "text") return true;
    const text = (block.data.text || "").trim();
    if (!text) return true;
    const plain = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\n+/g, " ").trim().toLowerCase();
    const isBoilerplate = BOILERPLATE_PHRASES.some(
      (phrase) => plain === phrase || plain.startsWith(phrase + ".") || plain.startsWith(phrase + "!")
    );
    if (isBoilerplate) { stripped++; return false; }
    return true;
  });
  return { blocks: filtered, stripped };
}

// ── POST /api/admin/import ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const totalT0 = Date.now();

  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getOrCreateProfile(userId);
    if (!profile.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data" },
        { status: 400 },
      );
    }

    const file = formData.get("pdf") as File | null;

    if (!file || !file.size) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    // ── Step 1: Extract text from PDF (per-page) ────────────────────────

    const pdfT0 = Date.now();
    let pageTexts: string[];
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    try {
      const pdfParse = (await import("pdf-parse-fork")).default;
      const buffer = pdfBuffer;
      const pages: string[] = [];

      await pdfParse(buffer, {
        // Custom page renderer: captures per-page text and returns it
        // (pdf-parse concatenates returned strings with \n\n to form parsed.text)
        pagerender: (pageData: { getTextContent: (opts?: Record<string, boolean>) => Promise<{ items: Array<{ str?: string; transform: number[] }> }> }) => {
          return pageData.getTextContent({ normalizeWhitespace: true }).then((textContent) => {
            let lastY: number | undefined;
            let text = "";
            for (const item of textContent.items) {
              if (!("str" in item) || item.str === undefined) continue;
              if (lastY === item.transform[5] || lastY === undefined) {
                text += item.str;
              } else {
                text += "\n" + item.str;
              }
              lastY = item.transform[5];
            }
            pages.push(text);
            return text;
          });
        },
      });

      pageTexts = pages;
    } catch (err) {
      return NextResponse.json(
        { error: `PDF parsing failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
    const pdfExtractMs = Date.now() - pdfT0;

    const totalChars = pageTexts.reduce((s, p) => s + p.length, 0);
    console.log(`[import] PDF extracted in ${fmtMs(pdfExtractMs)}: ${pageTexts.length} pages, ${totalChars} chars`);

    if (totalChars < 200) {
      return NextResponse.json(
        {
          error:
            "PDF appears to be a scanned image with no selectable text. OCR support is not yet implemented — please use a PDF with selectable text.",
        },
        { status: 422 },
      );
    }

    // ── Step 2: Initialize Anthropic client ─────────────────────────────

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 },
      );
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });

    // ── Step 3: Pass 1 — Table of Contents (Sonnet, full text) ──────────

    const tocText = buildTocText(pageTexts);
    console.log(`[import] Pass 1: Extracting TOC with ${TOC_MODEL} (${tocText.length} chars)...`);
    const tocPrompt = buildTocPrompt(tocText);

    let tocResult: CallResult;
    try {
      tocResult = await callClaude(anthropic, tocPrompt, TOC_MODEL, 8000);
    } catch (err) {
      return NextResponse.json(
        { error: `Claude API error (TOC pass): ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }

    console.log(
      `[import] TOC done in ${fmtMs(tocResult.usage.durationMs)} — ` +
      `${tocResult.usage.inputTokens} in / ${tocResult.usage.outputTokens} out — ` +
      `${fmtUsd(tocResult.usage.costUsd)}`,
    );

    let tocParsed: { issue: IssueMeta; articles: TocArticle[] };
    try {
      tocParsed = extractJson(tocResult.text);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to parse TOC response as JSON",
          raw: tocResult.text.slice(0, 2000),
          parseError: err instanceof Error ? err.message : String(err),
        },
        { status: 422 },
      );
    }

    if (!tocParsed.issue || !Array.isArray(tocParsed.articles)) {
      return NextResponse.json(
        { error: "TOC response missing 'issue' or 'articles' keys", raw: tocResult.text.slice(0, 2000) },
        { status: 422 },
      );
    }

    // Normalize issue metadata
    const issue: IssueMeta = {
      month: typeof tocParsed.issue.month === "number" ? tocParsed.issue.month : 0,
      year: typeof tocParsed.issue.year === "number" ? tocParsed.issue.year : 0,
      volume: typeof tocParsed.issue.volume === "number" ? tocParsed.issue.volume : null,
      number: typeof tocParsed.issue.number === "number" ? tocParsed.issue.number : null,
      title: tocParsed.issue.title || "Unknown Issue",
    };

    console.log(`[import] Found ${tocParsed.articles.length} articles for ${issue.title}`);

    // ── FULL TOC DUMP (for debugging page ranges, solution merging, etc.) ──
    console.log(`[import] ══════════════ RAW TOC RESPONSE ══════════════`);
    console.log(JSON.stringify(tocParsed, null, 2));
    console.log(`[import] ══════════════ END RAW TOC ══════════════`);

    // Log all articles from TOC before any processing
    for (let i = 0; i < tocParsed.articles.length; i++) {
      const a = tocParsed.articles[i];
      const pagesStr = Array.isArray(a.pdf_pages)
        ? a.pdf_pages.map(([s, e]: number[]) => s === e ? `${s}` : `${s}-${e}`).join(", ")
        : "(no pages)";
      const isSolutions = /solutions?$/i.test(a.title);
      console.log(
        `[import]   TOC[${i + 1}]: "${a.title}" — [${pagesStr}]${isSolutions ? " ← SOLUTIONS (should be merged)" : ""}`,
      );
    }

    // ── Step 4: Normalize page ranges and compute article text slices ───

    let tocArticles = tocParsed.articles;

    // Backward compatibility: convert old pdf_start_page/pdf_end_page to pdf_pages
    for (const a of tocArticles) {
      if (!Array.isArray(a.pdf_pages) && typeof a.pdf_start_page === "number") {
        const start = a.pdf_start_page > 0 ? a.pdf_start_page : 1;
        const end = typeof a.pdf_end_page === "number" && a.pdf_end_page >= start
          ? a.pdf_end_page : start;
        const ranges: number[][] = [[start, end]];
        if (Array.isArray(a.pdf_extra_pages)) {
          for (const p of a.pdf_extra_pages) {
            if (typeof p === "number" && p >= 1 && p <= pageTexts.length) {
              ranges.push([p, p]);
            }
          }
        }
        a.pdf_pages = ranges;
        console.log(
          `[import]   Converted legacy page fields for "${a.title}" → pdf_pages: ${JSON.stringify(ranges)}`,
        );
      }
    }

    // Validate and sanitize pdf_pages
    for (const a of tocArticles) {
      if (!Array.isArray(a.pdf_pages) || a.pdf_pages.length === 0) {
        a.pdf_pages = [[1, pageTexts.length]];
      }
      a.pdf_pages = a.pdf_pages
        .map(([s, e]) => {
          const start = Math.max(1, Math.min(typeof s === "number" ? s : 1, pageTexts.length));
          const end = Math.max(start, Math.min(typeof e === "number" ? e : start, pageTexts.length));
          return [start, end];
        })
        .sort((a, b) => a[0] - b[0]);
    }

    // ── Step 4b: Merge problem + solution articles ──────────────────────

    tocArticles = mergeProblemSolutionArticles(tocArticles);

    // ── Step 4b2: Scan raw PDF text for "Solutions on page XX" references ──
    // For known problem articles, scan their pages for solution page references
    // and add those pages if they're missing from the article's pdf_pages.
    const PROBLEM_ARTICLE_PATTERNS = [
      "test your play", "improve your play", "test your defense",
      "improve your defense", "playing suit combinations", "new critical moments",
    ];

    for (const a of tocArticles) {
      const titleLower = (a.title || "").toLowerCase();
      const isProblemArticle = PROBLEM_ARTICLE_PATTERNS.some(p => titleLower.includes(p));
      if (!isProblemArticle) continue;

      // Get the text for this article's pages and scan for solution references
      const articlePageNums: number[] = [];
      for (const [s, e] of a.pdf_pages) {
        for (let p = s; p <= e; p++) articlePageNums.push(p);
      }
      const articleText = articlePageNums.map(p => pageTexts[p - 1] || "").join("\n");

      // Look for "Solution(s) on page XX", "(Solution on page XX.)", "Solutions overleaf"
      const solPageRefs = articleText.match(/solutions?\s+(?:on\s+)?page\s+(\d+)/gi) || [];
      const overleafRefs = articleText.match(/solutions?\s+overleaf/gi) || [];

      if (solPageRefs.length > 0 || overleafRefs.length > 0) {
        console.log(`[import]   📖 "${a.title}" solution references found: ${[...solPageRefs, ...overleafRefs].join(", ")}`);
      }

      // Extract referenced page numbers
      const referencedPages = new Set<number>();
      for (const ref of solPageRefs) {
        const match = ref.match(/page\s+(\d+)/i);
        if (match) {
          // This is the MAGAZINE page number, not PDF page number.
          // We need to find which PDF page corresponds to this magazine page.
          const magPage = parseInt(match[1], 10);
          // Search all pages for the magazine page number
          for (let pi = 0; pi < pageTexts.length; pi++) {
            const pageText = pageTexts[pi];
            // Magazine page numbers typically appear near the top of the page
            const firstLines = pageText.split("\n").slice(0, 5).join(" ");
            if (firstLines.includes(String(magPage))) {
              referencedPages.add(pi + 1); // Convert to 1-indexed PDF page
            }
          }
        }
      }

      // For "overleaf", add the page right after the last page
      if (overleafRefs.length > 0) {
        const lastPage = Math.max(...articlePageNums);
        if (lastPage < pageTexts.length) {
          referencedPages.add(lastPage + 1);
        }
      }

      // Add any missing solution pages
      const existingPages = new Set(articlePageNums);
      const newPages: number[] = [];
      for (const p of Array.from(referencedPages)) {
        if (!existingPages.has(p) && p >= 1 && p <= pageTexts.length) {
          newPages.push(p);
        }
      }

      if (newPages.length > 0) {
        for (const p of newPages) {
          a.pdf_pages.push([p, p]);
        }
        a.pdf_pages.sort((x, y) => x[0] - y[0]);
        console.log(
          `[import]   📖 Added solution pages to "${a.title}": +[${newPages.join(", ")}] → pdf_pages: ${JSON.stringify(a.pdf_pages)}`,
        );
      }
    }

    // ── Step 4b3: Scan ALL pages for solution section headers ──────────
    // Even if TOC/merge didn't find solutions, scan page text for solution headers
    // and link them to their parent articles.
    for (const a of tocArticles) {
      const titleLower = (a.title || "").toLowerCase();
      const isProblemArticle = PROBLEM_ARTICLE_PATTERNS.some(p => titleLower.includes(p));
      if (!isProblemArticle) continue;

      // Look through all pages NOT already in this article for solution headers
      const existingPages = new Set<number>();
      for (const [s, e] of a.pdf_pages) {
        for (let p = s; p <= e; p++) existingPages.add(p);
      }

      const solTitlePatterns = [
        new RegExp(`${a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Solutions?`, "i"),
        new RegExp(`Solutions?\\s+(?:to\\s+)?${a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
      ];

      const foundSolPages: number[] = [];
      for (let pi = 0; pi < pageTexts.length; pi++) {
        if (existingPages.has(pi + 1)) continue;
        const pageText = pageTexts[pi];
        // Check first 500 chars of each page for solution title patterns
        const pageHead = pageText.slice(0, 500);
        for (const pat of solTitlePatterns) {
          if (pat.test(pageHead)) {
            foundSolPages.push(pi + 1);
            break;
          }
        }
      }

      if (foundSolPages.length > 0) {
        for (const p of foundSolPages) {
          a.pdf_pages.push([p, p]);
        }
        a.pdf_pages.sort((x, y) => x[0] - y[0]);
        console.log(
          `[import]   📖 Found solution header pages for "${a.title}": +[${foundSolPages.join(", ")}] → pdf_pages: ${JSON.stringify(a.pdf_pages)}`,
        );
      }
    }

    // ── Step 4c: Filter next-month content ──────────────────────────────

    tocArticles = filterNextMonthArticles(tocArticles, issue.month);

    // Deduplicate near-identical articles
    tocArticles = deduplicateTocArticles(tocArticles);

    console.log(`[import] After merge/filter/dedup: ${tocArticles.length} articles`);

    const articles: ParsedArticle[] = tocArticles.map((a) => {
      let articleText = sliceArticleText(pageTexts, a.pdf_pages);

      // Pre-process: replace digit-encoded suit symbols with Unicode characters
      const suitFix = preprocessSuitSymbols(articleText);
      if (suitFix.replaced) {
        console.log(`[import]   ♠♥♦♣ Pre-processed suit symbols in "${a.title || "Untitled"}"`);
        articleText = suitFix.text;
      }

      return {
        title: a.title || "Untitled",
        author_name: a.author_name || "",
        category: a.category || "",
        tags: Array.isArray(a.tags) ? a.tags : [],
        source_page: typeof a.source_page === "number" ? a.source_page : 0,
        excerpt: a.excerpt || "",
        content_blocks: [],
        _sourceText: articleText,
      };
    });

    // Log page ranges and warn about suspiciously large slices
    for (let i = 0; i < articles.length; i++) {
      const a = tocArticles[i];
      const textLen = articles[i]._sourceText.length;
      const totalRangePages = a.pdf_pages.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
      const rangeStr = a.pdf_pages.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
      const tag = textLen > 30000 ? " ⚠️  LARGE" : "";
      console.log(
        `[import]   Article ${i + 1}: "${articles[i].title}" — PDF pp. [${rangeStr}] (${totalRangePages} pages, ${a.pdf_pages.length} range(s), ${textLen} chars)${tag}`,
      );
      if (textLen > 30000) {
        console.warn(
          `[import]   ⚠️  "${articles[i].title}" has ${textLen} chars. Page range may be too wide — will chunk into multiple API calls.`,
        );
      }
    }

    // ── Step 5: Pass 2 — Parse each article (Haiku, article text only) ──

    const articleErrors: ArticleParseError[] = [];
    const articleCallStats: ImportStats["articleCalls"] = [];

    for (let idx = 0; idx < articles.length; idx++) {
      const article = articles[idx];

      if (idx > 0) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }

      const textLen = article._sourceText.length;
      const rangeStr = tocArticles[idx].pdf_pages.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
      const pageRange = `PDF pp. [${rangeStr}]`;
      const chunks = splitIntoChunks(article._sourceText);
      const chunkLabel = chunks.length > 1 ? ` (${chunks.length} chunks)` : "";
      const articleModel = pickArticleModel(article.category);

      console.log(
        `[import] Pass 2 [${idx + 1}/${articles.length}]: "${article.title}" (${pageRange}, ${textLen} chars${chunkLabel}, ${articleModel})...`,
      );

      // Log chunk details for multi-chunk articles
      if (chunks.length > 1) {
        for (let ci = 0; ci < chunks.length; ci++) {
          const chunkStart = article._sourceText.indexOf(chunks[ci].slice(0, 100));
          console.log(
            `[import]     chunk ${ci + 1}/${chunks.length}: ${chunks[ci].length} chars (offset ~${chunkStart})`,
          );
        }
        console.log(
          `[import]     Total text: ${textLen} chars → ${chunks.length} chunks (max ${CHUNK_MAX_CHARS} chars/chunk, ${CHUNK_OVERLAP_CHARS} overlap)`,
        );
      }

      // Log raw extracted text for MSC and CTC articles (debugging garbled hands)
      const catLower = article.category.toLowerCase();
      const isMsc = catLower.includes("master solvers") || catLower.includes("msc");
      const isCtc = catLower.includes("challenge the champs") || catLower.includes("ctc");
      if (isMsc || isCtc) {
        console.log(
          `[import]   📋 Raw text for "${article.title}" (first 5000 chars):\n` +
          article._sourceText.slice(0, 5000),
        );
      }

      // TEMP DEBUG: dump full MSC raw text and Claude response to files
      if (isMsc) {
        const fs = await import("fs");
        fs.writeFileSync("/tmp/msc-raw-text.txt", article._sourceText, "utf-8");
        console.log(`[import]   📁 Wrote full MSC raw text to /tmp/msc-raw-text.txt (${article._sourceText.length} chars)`);
      }

      const shouldUseImages = shouldParseWithImages(article.category);

      try {
        const allBlocks: ContentBlock[] = [];
        const totalUsage: CallUsage = {
          model: articleModel,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs: 0,
        };

        if (shouldUseImages) {
          // ── IMAGE-BASED PARSING (all articles with hands/auctions) ──
          // Convert PDF pages to images and send to Claude's vision API.
          // Send ONLY images (no extracted text) to avoid confusion.
          // Small batches (3 pages) for accuracy over speed.

          const pdfPageRanges = tocArticles[idx].pdf_pages;
          const pageNums: number[] = [];
          for (const [s, e] of pdfPageRanges) {
            for (let p = s; p <= e; p++) pageNums.push(p);
          }

          console.log(`[import]   📸 Rendering ${pageNums.length} PDF pages as images (300 DPI) for vision API...`);
          const renderT0 = Date.now();

          // Small batches: 3 pages per call for maximum accuracy.
          // More API calls but much better transcription quality.
          const IMAGE_BATCH_SIZE = 3;
          const pageBatches: number[][] = [];
          for (let b = 0; b < pageNums.length; b += IMAGE_BATCH_SIZE) {
            pageBatches.push(pageNums.slice(b, b + IMAGE_BATCH_SIZE));
          }

          // Render ALL page images upfront at 300 DPI for sharp text
          const allImages = await renderPdfPagesToImages(pdfBuffer, pageNums, 300);
          const renderMs = Date.now() - renderT0;
          console.log(`[import]   📸 Rendered ${allImages.length} page images in ${fmtMs(renderMs)}`);

          for (let bi = 0; bi < pageBatches.length; bi++) {
            if (bi > 0) await sleep(DELAY_BETWEEN_CALLS_MS);

            const batchPageNums = pageBatches[bi];
            const batchImages = allImages.filter(img => batchPageNums.includes(img.pageNum));

            // Use dedicated image prompt — no extracted text, focused instructions
            const prompt = buildImageArticlePrompt(
              article.title,
              article.author_name,
              article.source_page,
              article.category,
              tocArticles[idx].pdf_pages,
              pageBatches.length > 1 ? { batchNum: bi + 1, totalBatches: pageBatches.length, pageNums: batchPageNums } : undefined,
            );

            console.log(`[import]     image batch ${bi + 1}/${pageBatches.length}: ${batchImages.length} pages (${batchPageNums.join(", ")})...`);

            const result = await callClaudeWithImages(anthropic, batchImages, prompt, articleModel, 16384);

            // Debug dump for MSC
            if (isMsc) {
              const fs = await import("fs");
              fs.writeFileSync("/tmp/msc-claude-response.txt", result.text, "utf-8");
              console.log(`[import]   📁 Wrote MSC Claude response to /tmp/msc-claude-response.txt (${result.text.length} chars)`);
            }

            const parsed = extractJson<{ content_blocks: ContentBlock[] }>(result.text);

            if (!Array.isArray(parsed.content_blocks)) {
              throw new Error(
                `Response missing 'content_blocks' array. Keys found: ${Object.keys(parsed).join(", ")}`,
              );
            }

            for (const block of parsed.content_blocks) {
              block.id = `b${allBlocks.length + 1}`;
              allBlocks.push(block);
            }

            totalUsage.inputTokens += result.usage.inputTokens;
            totalUsage.outputTokens += result.usage.outputTokens;
            totalUsage.costUsd += result.usage.costUsd;
            totalUsage.durationMs += result.usage.durationMs;

            console.log(`[import]     image batch ${bi + 1}: ${parsed.content_blocks.length} blocks`);
          }
        } else {
          // ── TEXT-BASED PARSING (standard articles) ───────────────────

        for (let ci = 0; ci < chunks.length; ci++) {
          if (ci > 0) {
            await sleep(DELAY_BETWEEN_CALLS_MS);
          }

          const chunkText = chunks[ci];
          const chunkNote = chunks.length > 1
            ? `\n\nNOTE: This is chunk ${ci + 1} of ${chunks.length} for this article. ${ci > 0 ? "Some text from the previous chunk may be repeated at the start for context — do NOT duplicate content blocks you already produced. Continue from where the previous chunk left off." : "The article continues in subsequent chunks."}`
            : "";

          const prompt = buildArticlePrompt(
            chunkText + chunkNote,
            article.title,
            article.author_name,
            article.source_page,
            article.category,
            tocArticles[idx].pdf_pages,
          );

          if (chunks.length > 1) {
            console.log(`[import]     chunk ${ci + 1}/${chunks.length}: ${chunkText.length} chars...`);
          }

          const result = await callClaude(anthropic, prompt, articleModel, 16384);

          const parsed = extractJson<{ content_blocks: ContentBlock[] }>(result.text);

          if (!Array.isArray(parsed.content_blocks)) {
            throw new Error(
              `Response missing 'content_blocks' array. Keys found: ${Object.keys(parsed).join(", ")}`,
            );
          }

          // Re-number block IDs to avoid collisions across chunks
          for (const block of parsed.content_blocks) {
            block.id = `b${allBlocks.length + 1}`;
            allBlocks.push(block);
          }

          totalUsage.inputTokens += result.usage.inputTokens;
          totalUsage.outputTokens += result.usage.outputTokens;
          totalUsage.costUsd += result.usage.costUsd;
          totalUsage.durationMs += result.usage.durationMs;

          if (chunks.length > 1) {
            console.log(`[import]     chunk ${ci + 1}: ${parsed.content_blocks.length} blocks`);
          }
        }

        } // end text-based parsing

        articles[idx].content_blocks = allBlocks;

        // Log MSC problem coverage — check which letters A-H are present
        if (isMsc) {
          const problemLetters = new Set<string>();
          for (const block of allBlocks) {
            if (block.type !== "text") continue;
            const m = (block.data.text || "").match(/\*\*Problem\s+([A-H])\b/i);
            if (m) problemLetters.add(m[1].toUpperCase());
          }
          const found = Array.from(problemLetters).sort().join(", ");
          const expected = ["A", "B", "C", "D", "E", "F", "G", "H"];
          const missing = expected.filter(l => !problemLetters.has(l));
          if (missing.length > 0) {
            console.warn(
              `[import]   ⚠️  MSC missing problems: ${missing.join(", ")} (found: ${found})`,
            );
          } else {
            console.log(`[import]   ✓ MSC has all 8 problems: ${found}`);
          }
        }

        // Log warning and raw text for articles with very few content blocks
        if (allBlocks.length <= 2 && textLen > 500) {
          console.warn(
            `[import]   ⚠️  "${article.title}" has only ${allBlocks.length} block(s) from ${textLen} chars of text. Raw text (first 3000 chars):\n` +
            article._sourceText.slice(0, 3000),
          );
        }

        articleCallStats.push({ title: article.title, ...totalUsage });
        console.log(
          `[import]   ✓ ${allBlocks.length} blocks — ` +
          `${fmtMs(totalUsage.durationMs)} — ` +
          `${totalUsage.inputTokens} in / ${totalUsage.outputTokens} out — ` +
          `${fmtUsd(totalUsage.costUsd)}`,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[import]   ✗ Failed: ${errMsg}`);
        articleErrors.push({
          articleIndex: idx,
          title: article.title,
          error: errMsg,
        });
      }
    }

    // ── Step 6: Normalize tens, auto-fix hands/auctions, validate ───────

    const allFixes: AutoFixResult[] = [];
    const allAuctionFixes: AuctionFixResult[] = [];

    for (let i = 0; i < articles.length; i++) {
      // Normalize "10" → "T" in all blocks
      articles[i].content_blocks = normalizeTens(articles[i].content_blocks);

      // Auto-fix hands
      const { blocks: fixedBlocks, fixes } = autoFixContentBlocks(articles[i].content_blocks);
      if (fixes.length > 0) {
        articles[i].content_blocks = fixedBlocks;
        allFixes.push(...fixes);
        console.log(
          `[import]   Auto-fixed ${fixes.length} hand(s) in "${articles[i].title}": ` +
          fixes.map((f) => `${f.direction} ${f.suit}: "${f.before}" → "${f.after}"`).join(", "),
        );
      }

      // Auto-fix auctions
      const { blocks: auctionFixedBlocks, fixes: auctionFixes } = autoFixAuctions(articles[i].content_blocks);
      if (auctionFixes.length > 0) {
        articles[i].content_blocks = auctionFixedBlocks;
        allAuctionFixes.push(...auctionFixes);
        console.log(
          `[import]   Auto-fixed ${auctionFixes.length} auction(s) in "${articles[i].title}": ` +
          auctionFixes.map((f) => f.description).join(", "),
        );
      }

      // Fix MSC auctions: ensure "?" lands on South's seat
      if (articles[i].category?.toLowerCase().includes("master solvers")) {
        const mscResult = fixMscAuctions(articles[i].content_blocks);
        if (mscResult.fixes.length > 0) {
          articles[i].content_blocks = mscResult.blocks;
          console.log(`[import]   MSC auction fix in "${articles[i].title}": ${mscResult.fixes.join("; ")}`);
        }
      }

      // Strip next-month content from within articles
      if (issue.month) {
        const nmResult = stripNextMonthBlocks(articles[i].content_blocks, issue.month);
        if (nmResult.stripped > 0) {
          articles[i].content_blocks = nmResult.blocks;
          console.log(`[import]   Stripped ${nmResult.stripped} next-month block(s) from "${articles[i].title}"`);
        }
      }

      // Strip boilerplate blocks
      {
        const bpResult = stripBoilerplateBlocks(articles[i].content_blocks);
        if (bpResult.stripped > 0) {
          articles[i].content_blocks = bpResult.blocks;
          console.log(`[import]   Stripped ${bpResult.stripped} boilerplate block(s) from "${articles[i].title}"`);
        }
      }

      // Strip cross-references (print artifacts)
      {
        const crResult = stripCrossReferences(articles[i].content_blocks);
        if (crResult.stripped > 0) {
          articles[i].content_blocks = crResult.blocks;
          console.log(`[import]   Stripped cross-references from ${crResult.stripped} block(s) in "${articles[i].title}"`);
        }
      }

      // Strip author from title (e.g. "Kantar for the Defense by Edwin B. Kantar")
      {
        const { title: cleanTitle, extractedAuthor } = stripAuthorFromTitle(
          articles[i].title,
          articles[i].author_name || undefined,
        );
        if (extractedAuthor) {
          console.log(`[import]   Stripped author from title: "${articles[i].title}" → "${cleanTitle}"`);
          if (!articles[i].author_name) {
            articles[i].author_name = extractedAuthor;
          }
          articles[i].title = cleanTitle;
        }
      }

      // Apply category mapping and inference
      {
        const rawCat = articles[i].category || "";
        let mapped = rawCat ? mapCategory(rawCat) : inferCategoryFromTitle(articles[i].title);
        if (!mapped) mapped = rawCat;
        if (mapped !== rawCat) {
          console.log(`[import]   Category mapped: "${rawCat}" → "${mapped}" for "${articles[i].title}"`);
          articles[i].category = mapped;
        }
      }

      // Assign level and month/year
      articles[i].level = inferLevel(articles[i].category, articles[i].tags);
      articles[i].month = issue.month;
      articles[i].year = issue.year;

      // Wrap solution blocks and optionally reorder
      const interleaveResult = interleaveProblemSolutions(articles[i].content_blocks);
      if (interleaveResult.solutionCount > 0) {
        articles[i].content_blocks = interleaveResult.blocks;
        const action = interleaveResult.reordered ? "Reordered + wrapped" : "Wrapped";
        console.log(
          `[import]   🔀 ${action} ${interleaveResult.solutionCount} solution(s) in "${articles[i].title}" (${interleaveResult.problemCount} problems)`,
        );
        // Verify SolutionBlocks were created
        const solBlockCount = interleaveResult.blocks.filter(b => b.type === "solution").length;
        console.log(
          `[import]   🔍 Result: ${interleaveResult.blocks.length} blocks total, ${solBlockCount} SolutionBlock(s)`,
        );
      } else {
        // Log even when no solutions found, so we can see what's happening
        const blockTypes = articles[i].content_blocks.map(b => b.type);
        const typeCounts = blockTypes.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {} as Record<string, number>);
        console.log(
          `[import]   ℹ️  No solution markers found in "${articles[i].title}" — block types: ${JSON.stringify(typeCounts)}`,
        );
      }
    }

    const warnings: ValidationWarning[] = [];
    for (let i = 0; i < articles.length; i++) {
      const blockErrors = validateContentBlocks(articles[i].content_blocks);
      if (blockErrors.length > 0) {
        warnings.push({
          articleIndex: i,
          title: articles[i].title,
          errors: blockErrors,
        });
      }
    }

    // ── Final block-type dump (for debugging solution blocks) ──────────
    for (let i = 0; i < articles.length; i++) {
      const types = articles[i].content_blocks.map(b => b.type);
      const typeCounts = types.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {} as Record<string, number>);
      console.log(`[import] FINAL "${articles[i].title}": ${types.length} blocks — ${JSON.stringify(typeCounts)}`);
    }

    // ── Step 7: Compute totals and return ────────────────────────────────

    const totalDurationMs = Date.now() - totalT0;

    const allUsages = [tocResult.usage, ...articleCallStats];
    const totals = {
      inputTokens: allUsages.reduce((s, u) => s + u.inputTokens, 0),
      outputTokens: allUsages.reduce((s, u) => s + u.outputTokens, 0),
      costUsd: allUsages.reduce((s, u) => s + u.costUsd, 0),
      apiCalls: allUsages.length,
    };

    const stats: ImportStats = {
      totalDurationMs,
      pdfExtractMs,
      tocCall: tocResult.usage,
      articleCalls: articleCallStats,
      totals,
    };

    console.log(
      `[import] ══════════════════════════════════════════════\n` +
      `[import] DONE in ${fmtMs(totalDurationMs)}\n` +
      `[import]   API calls: ${totals.apiCalls}\n` +
      `[import]   Input tokens: ${totals.inputTokens.toLocaleString()}\n` +
      `[import]   Output tokens: ${totals.outputTokens.toLocaleString()}\n` +
      `[import]   Estimated cost: ${fmtUsd(totals.costUsd)}\n` +
      `[import]   Articles: ${articles.length} (${articleErrors.length} failed)\n` +
      `[import]   Auto-fixes: ${allFixes.length} hand(s), ${allAuctionFixes.length} auction(s)\n` +
      `[import]   Warnings: ${warnings.length}\n` +
      `[import] ══════════════════════════════════════════════`,
    );

    return NextResponse.json({
      issue,
      articles,
      warnings,
      articleErrors: articleErrors.length > 0 ? articleErrors : undefined,
      autoFixes: allFixes.length > 0 ? allFixes : undefined,
      auctionFixes: allAuctionFixes.length > 0 ? allAuctionFixes : undefined,
      extractedTextLength: totalChars,
      articleCount: articles.length,
      stats,
    });
  } catch (err) {
    console.error("[/api/admin/import] Unhandled error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
