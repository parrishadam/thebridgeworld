#!/usr/bin/env npx tsx
/**
 * Standalone CLI tool for parsing Bridge World magazine issues.
 *
 * Three input modes:
 *   --pdf <file>       Modern PDF issues (1999-2025)
 *   --spreads <dir>    Scanned spread images (1929-1998), YYYYMM-LL-RR.jpg
 *   --images <dir>     Individual page images (JPG/PNG), sorted alphabetically
 *
 * Architecture:
 *   Pass 1: TOC extraction from first pages
 *   Pass 2: Article-by-article parsing (one article per API call sequence)
 *   Pass 3: Post-processing — normalize, auto-fix, validate
 *
 * Usage:
 *   npx tsx scripts/parse-issue.ts --pdf ~/Downloads/BW-April-2025.pdf --issue "April 2025"
 *   npx tsx scripts/parse-issue.ts --spreads ~/issues/1975/197501/ --issue "January 1975"
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

import sharp from "sharp";
import { jsonrepair } from "jsonrepair";
import type { ContentBlock } from "../src/types/index.js";
import {
  normalizeTens,
  interleaveProblemSolutions,
  mergeProblemSolutionArticles,
  filterNextMonthArticles,
  fixMscAuctions,
  stripNextMonthBlocks,
  stripBoilerplateBlocks,
  stripCrossReferences,
  mapCategory,
  inferCategoryFromTitle,
  inferLevel,
  MONTH_NAMES,
  type TocArticle,
} from "../src/lib/postProcess.js";
import {
  autoFixContentBlocks,
  autoFixAuctions,
  validateContentBlocks,
} from "../src/lib/validateBlocks.js";
import { buildImageArticlePrompt } from "../src/lib/importPrompt.js";

// ── Constants ──────────────────────────────────────────────────────────────

const MODEL = "claude-opus-4-20250514";
const DELAY_MS = 2_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 60_000;
const DPI = 300;
const PAGES_PER_ARTICLE_CALL = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
};

const SYSTEM_PROMPT_PATH = path.resolve(__dirname, "../docs/PARSING-PROMPT.md");

// ── CLI argument parsing ───────────────────────────────────────────────────

type InputMode = "pdf" | "spreads" | "images";

interface CliArgs {
  mode: InputMode;
  inputPath: string;  // PDF file path or folder path
  issueName: string;
  issueSlug: string;
  outputDir: string;
  resumeFrom?: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let pdfPath = "";
  let spreadsPath = "";
  let imagesPath = "";
  let issueName = "";
  let outputDir = "";
  let resumeFrom: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--pdf":
        pdfPath = args[++i];
        break;
      case "--spreads":
        spreadsPath = args[++i];
        break;
      case "--images":
        imagesPath = args[++i];
        break;
      case "--issue":
        issueName = args[++i];
        break;
      case "--output":
        outputDir = args[++i];
        break;
      case "--resume":
        resumeFrom = 1; // Flag to indicate resume mode
        break;
      case "--help":
        console.log(`Usage:
  npx tsx scripts/parse-issue.ts --pdf <file> --issue "Month Year"
  npx tsx scripts/parse-issue.ts --spreads <dir> --issue "Month Year"
  npx tsx scripts/parse-issue.ts --images <dir> --issue "Month Year"

Input modes (choose one):
  --pdf <path>       PDF file (modern issues, 1999-2025)
  --spreads <dir>    Folder of spread JPGs: YYYYMM-LL-RR.jpg (scanned, 1929-1998)
  --images <dir>     Folder of individual page images (JPG/PNG)

Options:
  --issue <name>     Issue name, e.g. "April 2025" (required)
  --output <dir>     Output directory (default: ./output)
  --resume           Resume from progress file (skip already-parsed articles)
  --help             Show this help message`);
        process.exit(0);
    }
  }

  if (!issueName) {
    console.error("Error: --issue is required. Use --help for usage.");
    process.exit(1);
  }

  const modeCount = [pdfPath, spreadsPath, imagesPath].filter(Boolean).length;
  if (modeCount === 0) {
    console.error("Error: one of --pdf, --spreads, or --images is required. Use --help for usage.");
    process.exit(1);
  }
  if (modeCount > 1) {
    console.error("Error: specify only one of --pdf, --spreads, or --images.");
    process.exit(1);
  }

  let mode: InputMode;
  let inputPath: string;

  if (pdfPath) {
    mode = "pdf";
    inputPath = path.resolve(pdfPath);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: PDF file not found: ${pdfPath}`);
      process.exit(1);
    }
  } else if (spreadsPath) {
    mode = "spreads";
    inputPath = path.resolve(spreadsPath);
    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isDirectory()) {
      console.error(`Error: Spreads directory not found: ${spreadsPath}`);
      process.exit(1);
    }
  } else {
    mode = "images";
    inputPath = path.resolve(imagesPath);
    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isDirectory()) {
      console.error(`Error: Images directory not found: ${imagesPath}`);
      process.exit(1);
    }
  }

  const issueSlug = slugify(issueName);
  if (!outputDir) outputDir = "./output";
  outputDir = path.resolve(outputDir);

  return { mode, inputPath, issueName, issueSlug, outputDir, resumeFrom };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] || PRICING["claude-opus-4-20250514"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ── Usage tracking ─────────────────────────────────────────────────────────

interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

const totalUsage: CallUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0 };
let apiCallCount = 0;

function trackUsage(usage: CallUsage) {
  totalUsage.inputTokens += usage.inputTokens;
  totalUsage.outputTokens += usage.outputTokens;
  totalUsage.costUsd += usage.costUsd;
  totalUsage.durationMs += usage.durationMs;
  apiCallCount++;
}

// ── Image types ────────────────────────────────────────────────────────────

interface PageImage {
  pageNum: number;
  base64: string;
  mediaType: "image/png" | "image/jpeg";
}

// ── PDF text extraction ────────────────────────────────────────────────────

async function extractPdfText(pdfPath: string): Promise<string[]> {
  const pdfParse = (await import("pdf-parse-fork")).default;
  const buffer = fs.readFileSync(pdfPath);
  const pages: string[] = [];

  await pdfParse(buffer, {
    pagerender: (pageData: {
      getTextContent: (opts?: Record<string, boolean>) => Promise<{
        items: Array<{ str?: string; transform: number[] }>;
      }>;
    }) => {
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

  return pages;
}

// ── PDF page rendering (pdftoppm) ──────────────────────────────────────────

function findPdftoppm(): string {
  const localBin = path.join(os.homedir(), ".local", "bin", "pdftoppm");
  try {
    return execSync("which pdftoppm 2>/dev/null").toString().trim();
  } catch {
    if (fs.existsSync(localBin)) return localBin;
    throw new Error("pdftoppm not found. Install poppler-utils: sudo apt-get install -y poppler-utils");
  }
}

function renderPdfPages(
  pdfPath: string,
  pageNums: number[],
  dpi: number = DPI,
): PageImage[] {
  const pdftoppmPath = findPdftoppm();
  const localLib = path.join(os.homedir(), ".local", "lib");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-render-"));
  const results: PageImage[] = [];

  try {
    for (const pageNum of pageNums) {
      const outPrefix = path.join(tmpDir, `page-${pageNum}`);
      const cmd = `"${pdftoppmPath}" -png -r ${dpi} -f ${pageNum} -l ${pageNum} -singlefile "${pdfPath}" "${outPrefix}"`;
      const env = { ...process.env, LD_LIBRARY_PATH: localLib };
      execSync(cmd, { env, timeout: 30_000 });

      const pngPath = `${outPrefix}.png`;
      if (fs.existsSync(pngPath)) {
        results.push({
          pageNum,
          base64: fs.readFileSync(pngPath).toString("base64"),
          mediaType: "image/png",
        });
        fs.unlinkSync(pngPath);
      }
    }
  } finally {
    try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
  }

  return results;
}

// ── Spread image splitting (sharp) ────────────────────────────────────────

interface SpreadFile {
  filePath: string;
  leftPage: number;
  rightPage: number;
  singlePage?: boolean; // true for IFC/IBC (single page, not a spread)
}

function parseSpreadsFolder(folderPath: string): SpreadFile[] {
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.jpe?g$/i.test(f))
    .sort();

  const spreads: SpreadFile[] = [];
  // Pattern: YYYYMM-LL-RR.jpg (numeric page spreads)
  const spreadPattern = /^\d{6}-(\d+)-(\d+)\.jpe?g$/i;
  // Pattern: YYYYMM-IFC-IBC.jpg (inside covers)
  const ifcPattern = /^\d{6}-IFC-IBC\.jpe?g$/i;
  // Pattern: YYYYMM-OFC-OBC.jpg (outside covers — skip)
  const ofcPattern = /^\d{6}-OFC-OBC\.jpe?g$/i;

  for (const file of files) {
    const spreadMatch = file.match(spreadPattern);
    if (spreadMatch) {
      spreads.push({
        filePath: path.join(folderPath, file),
        leftPage: parseInt(spreadMatch[1], 10),
        rightPage: parseInt(spreadMatch[2], 10),
      });
      continue;
    }

    if (ifcPattern.test(file)) {
      // IFC (Inside Front Cover) often has the table of contents — treat as page 0
      // IBC (Inside Back Cover) is typically ads — skip
      spreads.push({
        filePath: path.join(folderPath, file),
        leftPage: 0,   // IFC → page 0 (before page 1)
        rightPage: -1,  // IBC → discard after splitting
        singlePage: false,
      });
      console.log(`  IFC-IBC: treating IFC as page 0 (table of contents), discarding IBC`);
      continue;
    }

    if (ofcPattern.test(file)) {
      // Outside covers — skip entirely
      console.log(`  Skipping outside covers: ${file}`);
      continue;
    }

    console.log(`  Warning: skipping unrecognized file: ${file}`);
  }

  return spreads;
}

async function splitSpreads(spreads: SpreadFile[]): Promise<Map<number, PageImage>> {
  const pageMap = new Map<number, PageImage>();

  for (const spread of spreads) {
    const metadata = await sharp(spread.filePath).metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    if (spread.singlePage) {
      // Single-page file (e.g. IFC) — don't split, just resize if needed
      let buf = await sharp(spread.filePath).jpeg({ quality: 85 }).toBuffer();
      buf = await ensureUnderSizeLimit(buf, width, height, "jpeg");
      pageMap.set(spread.leftPage, {
        pageNum: spread.leftPage,
        base64: buf.toString("base64"),
        mediaType: "image/jpeg",
      });
      continue;
    }

    const halfWidth = Math.floor(width / 2);

    // Left half → leftPage (use JPEG for scanned spreads — much smaller than PNG)
    let leftBuf = await sharp(spread.filePath)
      .extract({ left: 0, top: 0, width: halfWidth, height })
      .jpeg({ quality: 85 })
      .toBuffer();
    leftBuf = await ensureUnderSizeLimit(leftBuf, halfWidth, height, "jpeg");

    pageMap.set(spread.leftPage, {
      pageNum: spread.leftPage,
      base64: leftBuf.toString("base64"),
      mediaType: "image/jpeg",
    });

    // Right half → rightPage (skip if -1, e.g. IBC discard)
    if (spread.rightPage >= 0) {
      let rightBuf = await sharp(spread.filePath)
        .extract({ left: halfWidth, top: 0, width: width - halfWidth, height })
        .jpeg({ quality: 85 })
        .toBuffer();
      rightBuf = await ensureUnderSizeLimit(rightBuf, width - halfWidth, height, "jpeg");

      pageMap.set(spread.rightPage, {
        pageNum: spread.rightPage,
        base64: rightBuf.toString("base64"),
        mediaType: "image/jpeg",
      });
    }
  }

  return pageMap;
}

// ── Individual image loading ──────────────────────────────────────────────

async function loadImageFolder(folderPath: string): Promise<Map<number, PageImage>> {
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(jpe?g|png)$/i.test(f))
    .sort();

  const pageMap = new Map<number, PageImage>();

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(folderPath, files[i]);
    const isJpeg = /\.jpe?g$/i.test(files[i]);

    let buf: Buffer;
    if (isJpeg) {
      buf = fs.readFileSync(filePath);
    } else {
      buf = await sharp(filePath).png().toBuffer();
    }

    let mediaType: "image/jpeg" | "image/png" = isJpeg ? "image/jpeg" : "image/png";
    if (buf.length > MAX_IMAGE_BYTES) {
      const meta = await sharp(buf).metadata();
      const original = buf;
      buf = await ensureUnderSizeLimit(buf, meta.width || 2000, meta.height || 3000, isJpeg ? "jpeg" : "png");
      // ensureUnderSizeLimit may have converted PNG→JPEG to reduce size
      if (buf !== original && !isJpeg) mediaType = "image/jpeg";
    }

    const pageNum = i + 1;
    pageMap.set(pageNum, {
      pageNum,
      base64: buf.toString("base64"),
      mediaType,
    });
  }

  return pageMap;
}

// ── Image size limiting ───────────────────────────────────────────────────

async function ensureUnderSizeLimit(
  buf: Buffer,
  width: number,
  height: number,
  format: "png" | "jpeg" = "png",
): Promise<Buffer> {
  if (buf.length <= MAX_IMAGE_BYTES) return buf;

  // First try: if PNG, convert to JPEG (much smaller for scanned images)
  if (format === "png") {
    const jpegBuf = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
    if (jpegBuf.length <= MAX_IMAGE_BYTES) return jpegBuf;
    // If still too large, continue scaling down as JPEG
    buf = jpegBuf;
  }

  // Try JPEG quality reduction first (faster than resize)
  for (const quality of [75, 60, 45]) {
    const result = await sharp(buf).jpeg({ quality }).toBuffer();
    if (result.length <= MAX_IMAGE_BYTES) return result;
  }

  // Scale down by 70% repeatedly until under limit
  let scale = 0.7;
  let result = buf;
  for (let attempt = 0; attempt < 5 && result.length > MAX_IMAGE_BYTES; attempt++) {
    const newWidth = Math.floor(width * scale);
    const newHeight = Math.floor(height * scale);
    result = await sharp(buf)
      .resize({ width: newWidth, height: newHeight })
      .jpeg({ quality: 70 })
      .toBuffer();
    scale *= 0.7;
  }
  return result;
}

// ── Claude API calls ───────────────────────────────────────────────────────

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  images: PageImage[],
  userPrompt: string,
  maxTokens: number = 16384,
): Promise<{ text: string; usage: CallUsage }> {
  const t0 = Date.now();

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  for (const img of images) {
    (content as Anthropic.ContentBlockParam[]).push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }
  (content as Anthropic.ContentBlockParam[]).push({ type: "text", text: userPrompt });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      });

      let text = "";
      stream.on("text", (chunk) => { text += chunk; });

      const message = await stream.finalMessage();

      if (!text) {
        throw new Error("Claude returned no text response");
      }

      const inputTokens = message.usage?.input_tokens ?? 0;
      const outputTokens = message.usage?.output_tokens ?? 0;
      const usage: CallUsage = {
        inputTokens,
        outputTokens,
        costUsd: computeCost(MODEL, inputTokens, outputTokens),
        durationMs: Date.now() - t0,
      };
      trackUsage(usage);

      return { text, usage };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
        console.log(`  Rate limited. Waiting ${waitMs / 1000}s...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted rate-limit retries");
}

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
      console.log("  [extractJson] Repaired malformed JSON with jsonrepair");
      return JSON.parse(repaired);
    } catch (repairErr) {
      // Log the raw text to a file for debugging
      const failedPath = path.join(os.tmpdir(), `bw-parse-failed-${Date.now()}.json`);
      fs.writeFileSync(failedPath, raw);
      console.error(`  [extractJson] JSON parse failed even after repair. Raw text saved to: ${failedPath}`);
      throw repairErr;
    }
  }
}

// ── Prompts (user messages — system prompt is from PARSING-PROMPT.md) ─────

function buildTocUserPrompt(issueName: string, issueMonth?: number): string {
  const nextMonthFilter = issueMonth
    ? `\nIGNORE NEXT-MONTH CONTENT: This is the ${MONTH_NAMES[issueMonth]} issue. EXCLUDE any articles referencing ${MONTH_NAMES[issueMonth === 12 ? 1 : issueMonth + 1]} (e.g., "${MONTH_NAMES[issueMonth === 12 ? 1 : issueMonth + 1]} Problems", "West Hands for ${MONTH_NAMES[issueMonth === 12 ? 1 : issueMonth + 1]}"). These are previews for the next issue.\n`
    : "";

  return `These are the first pages of The Bridge World magazine, ${issueName} issue.

Extract the Table of Contents and issue metadata from these pages.

Return a JSON object:
{
  "issue": {
    "month": <1-12>,
    "year": <YYYY>,
    "volume": <number or null>,
    "number": <number or null>,
    "title": "${issueName}"
  },
  "articles": [
    {
      "title": "<article title>",
      "author_name": "<author or empty string>",
      "category": "<category>",
      "tags": ["<tag1>"],
      "source_page": <magazine page number>,
      "pdf_pages": [[<start_page>, <end_page>]],
      "excerpt": "<1-2 sentence description>"
    }
  ]
}

PAGE RANGE RULES:
- pdf_pages uses sequential page numbers (page 1 = first image shown).
- Each [start, end] pair must satisfy start <= end.
- Use multiple ranges for non-contiguous content: [[7, 7], [73, 73]].
- Articles CAN share page numbers when one ends and another begins on the same page.

SOLUTION PAGE REFERENCES — ABSOLUTELY CRITICAL:
For EVERY article that contains problems (Test Your Play, Improve Your Play, Test Your Defense, Improve Your Defense, Playing Suit Combinations, New Critical Moments), you MUST find the solution page reference. These articles ALWAYS have solutions on a SEPARATE page later in the magazine. The solution page reference is printed on the PROBLEM page itself, usually at the bottom. Look for:
- "Solution on page XX"
- "Solutions on page XX"
- "(Solution on page XX.)"
- "Solution page XX"
- "Solutions overleaf"
- "Answer on page XX"
- "See page XX"
You MUST include the solution page as a second range in pdf_pages. A problem article WITHOUT its solution pages is INCOMPLETE.
Example: "Improve Your Defense" on page 9, with "Solution on page 72" → pdf_pages: [[9, 9], [72, 72]].
If you cannot find a specific page reference on the problem page, check the Table of Contents for a "Solutions" entry.

SOLUTION MERGING — CRITICAL:
- "Test Your Play Solutions" is NOT a separate article — merge its pages into "Test Your Play".
- Same for: Improve Your Play, Improve Your Defense, Test Your Defense, Playing Suit Combinations.
- NEVER create an article with "Solutions" in its title.
${nextMonthFilter}
INTERLEAVED LAYOUT — CRITICAL FOR PAGE RANGES:
Tournament reports and other long articles span many consecutive pages (often 20-30+). Small recurring feature articles (Test Your Play, Improve Your Defense, Test Your Defense, Improve Your Play, Playing Suit Combinations) are printed MID-PAGE within the long article. They typically occupy only PART of one page, not multiple pages. The long article continues on the next page after the small article.

Example: If a tournament report runs from page 3 to page 31, and "Test Your Play" appears mid-page on page 7, then:
- The tournament report's page range is [[3, 31]] (the FULL span — it continues around the interleaved articles)
- "Test Your Play" page range is [[7, 7]] (just the one page where it appears, plus its solution page later)
- Both articles share page 7 — this is correct and expected

KEY RULES:
- A long article's page range must NOT be cut short just because a small feature appears mid-page.
- Small features typically occupy 1 page (or part of a page). If you think a small feature spans 5+ pages, you are probably wrong — those pages belong to the long article that continues around it.
- Pages CAN overlap between main and interleaved articles.
- Look at where the NEXT main article title appears at the TOP of a page to find where the long article truly ends.

Return ONLY valid JSON. No markdown fences, no commentary.`;
}


// ── Resume support ─────────────────────────────────────────────────────────

interface IssueMeta {
  month: number;
  year: number;
  volume: number | null;
  number: number | null;
  title: string;
}

interface ResumeData {
  toc: { issue: IssueMeta; articles: TocArticle[] };
  articleResults: Array<{ title: string; blocks: ContentBlock[] }>;
}

function getProgressPath(outputDir: string, issueSlug: string): string {
  return path.join(outputDir, `${issueSlug}-progress.json`);
}

function loadResume(progressPath: string): ResumeData | null {
  if (fs.existsSync(progressPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(progressPath, "utf-8"));
      // Detect old page-based format and discard it
      if (data.pageResults && !data.articleResults) {
        console.log(`  Old page-based progress file detected — discarding (incompatible format)`);
        return null;
      }
      return data as ResumeData;
    } catch {
      return null;
    }
  }
  return null;
}

function saveResume(progressPath: string, data: ResumeData): void {
  fs.writeFileSync(progressPath, JSON.stringify(data, null, 2));
}

// ── Interleaved article detection ──────────────────────────────────────

// Small recurring features that MAY be printed mid-page within longer articles.
// When interleaved, they occupy only part of one page within a larger article.
// When standalone, they span multiple pages on their own.
// Note: "new critical moments" is NOT here — it's always a standalone multi-page article.
const SMALL_FEATURES = [
  "test your play",
  "improve your play",
  "test your defense",
  "improve your defense",
  "playing suit combinations",
];

// Superset used for interleave annotation (includes NCM for solution interleaving)
const KNOWN_INTERLEAVED = [
  ...SMALL_FEATURES,
  "new critical moments",
];

// ── Fix missing solution pages ────────────────────────────────────────

// Articles that always have separate solution pages
const PROBLEM_ARTICLES = [
  "test your play",
  "improve your play",
  "test your defense",
  "improve your defense",
  "playing suit combinations",
  "new critical moments",
];

async function fixMissingSolutionPages(
  articles: TocArticle[],
  totalPages: number,
  client: Anthropic,
  systemPrompt: string,
  getPageImages: (pageNums: number[]) => PageImage[],
  getPageTexts: (pageNums: number[]) => string[] | undefined,
): Promise<void> {
  // Regex patterns for solution page references (case-insensitive)
  const SOL_PATTERNS = [
    /[Ss]olutions?\s+(?:on\s+)?page\s+(\d+)/i,
    /[Aa]nswers?\s+(?:on\s+)?page\s+(\d+)/i,
    /\([Ss]olution\s+(?:on\s+)?page\s+(\d+)\s*\.?\)/i,
    /[Ss]ee\s+(?:solutions?\s+(?:on\s+)?)?page\s+(\d+)/i,
    /page\s+(\d+)\s+for\s+(?:the\s+)?solutions?/i,
  ];

  function findSolutionPageInText(text: string, excludePages: Set<number>): number | null {
    for (const pattern of SOL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const page = parseInt(match[1], 10);
        if (page > 0 && page <= totalPages && !excludePages.has(page)) {
          return page;
        }
      }
    }
    return null;
  }

  for (const art of articles) {
    const titleLower = art.title.toLowerCase();
    const isProblemArticle = PROBLEM_ARTICLES.some(p => titleLower.includes(p));
    if (!isProblemArticle) continue;

    // Check if article already has solution pages
    const hasSolutionPages = art.pdf_pages.length > 1 ||
      (art.solution_page_ranges && art.solution_page_ranges.length > 0);
    if (hasSolutionPages) continue;

    // Gather all pages in this article's range
    const artPages: number[] = [];
    for (const [s, e] of art.pdf_pages) {
      for (let p = s; p <= e; p++) artPages.push(p);
    }
    const artPageSet = new Set(artPages);

    console.log(`  [solution-fix] "${art.title}" has no solution pages — scanning ${artPages.length} page(s)...`);

    // First try: scan extracted PDF text from ALL pages in the article's range
    let foundSolPage: number | null = null;
    const allTexts = getPageTexts(artPages);
    if (allTexts) {
      for (let i = 0; i < artPages.length; i++) {
        const text = allTexts[i] || "";
        const solPage = findSolutionPageInText(text, artPageSet);
        if (solPage) {
          foundSolPage = solPage;
          console.log(`  [solution-fix] Found "solution on page ${solPage}" in text of page ${artPages[i]}`);
          break;
        }
      }
    }

    // Second try: send the start page image to Claude (the solution reference
    // is usually on the problem page itself, often at the bottom)
    if (!foundSolPage) {
      const startPage = artPages[0];
      const images = getPageImages([startPage]);
      if (images.length === 0) continue;

      try {
        const result = await callClaude(
          client,
          systemPrompt,
          images,
          `This page from The Bridge World contains the article "${art.title}".

This is a problem article. Somewhere on this page there is text indicating where the solution can be found. Look carefully at ALL text on the page, especially near the bottom or end of the problem section.

Common patterns:
- "Solution on page XX"
- "Solutions on page XX"
- "(Solution on page XX.)"
- "Solution page XX"
- "Answer on page XX"
- "See page XX for the solution"

The page reference is a MAGAZINE page number (printed in the magazine).

Return ONLY a JSON object:
{ "solution_page": <number or null> }

Return the page number if found. Return null only if there is truly no solution page reference anywhere on this page.`,
          256,
        );

        const parsed = extractJson<{ solution_page: number | null }>(result.text);
        console.log(`  [solution-fix] Claude vision: solution_page=${parsed.solution_page} (${fmtUsd(result.usage.costUsd)})`);
        foundSolPage = parsed.solution_page;

        await sleep(DELAY_MS);
      } catch (err) {
        console.error(`  [solution-fix] Error checking "${art.title}":`, err instanceof Error ? err.message : err);
      }
    }

    // Apply the found solution page
    if (foundSolPage && foundSolPage > 0 && foundSolPage <= totalPages && !artPageSet.has(foundSolPage)) {
      art.pdf_pages.push([foundSolPage, foundSolPage]);
      art.pdf_pages.sort((a, b) => a[0] - b[0]);
      if (!art.solution_page_ranges) art.solution_page_ranges = [];
      art.solution_page_ranges.push([foundSolPage, foundSolPage]);
      console.log(`  [solution-fix] Added solution page ${foundSolPage} to "${art.title}"`);
    } else if (!foundSolPage) {
      console.log(`  [solution-fix] WARNING: No solution page found for "${art.title}"`);
    }
  }
}

// ── Post-TOC page range expansion ─────────────────────────────────────

function expandPageRanges(articles: TocArticle[], totalPages: number): void {
  const isSmallFeature = (a: TocArticle) =>
    SMALL_FEATURES.some(k => a.title.toLowerCase().includes(k));

  // ── Phase 1: Expand main (non-small-feature) articles to fill gaps ──
  // Only expand articles that are NOT small features. Small features keep
  // their TOC ranges intact in this phase.
  const mainSorted: { idx: number; startPage: number }[] = [];
  for (let i = 0; i < articles.length; i++) {
    if (!isSmallFeature(articles[i])) {
      mainSorted.push({ idx: i, startPage: articles[i].pdf_pages[0]?.[0] ?? 1 });
    }
  }
  mainSorted.sort((a, b) => a.startPage - b.startPage);

  for (let mi = 0; mi < mainSorted.length; mi++) {
    const art = articles[mainSorted[mi].idx];
    const startPage = mainSorted[mi].startPage;
    const tocEnd = art.pdf_pages[0]?.[1] ?? startPage;

    // Next main article's start page (small features don't create boundaries)
    const nextStart = mi + 1 < mainSorted.length
      ? mainSorted[mi + 1].startPage
      : totalPages + 1;
    const expandedEnd = Math.min(nextStart - 1, totalPages);

    if (expandedEnd > tocEnd) {
      const newPrimaryRange: number[] = [startPage, expandedEnd];
      const extraRanges = art.pdf_pages
        .slice(1)
        .filter(([s]) => s > expandedEnd);
      art.pdf_pages = [newPrimaryRange, ...extraRanges]
        .sort((a, b) => a[0] - b[0]);
      console.log(`[expand] "${art.title}": ${startPage}-${tocEnd} → ${startPage}-${expandedEnd}`);
    }
  }

  // ── Phase 2: Trim interleaved small features ────────────────────────
  // After main articles are expanded, check each small feature: if ALL of
  // its non-solution pages fall within a single main article's expanded
  // range, it's interleaved — trim to start page + solution pages only.
  // If not (standalone issue), leave its TOC range untouched.

  // Build page sets for expanded main articles
  const mainPageSets = mainSorted.map(({ idx }) => {
    const pages = new Set<number>();
    for (const [s, e] of articles[idx].pdf_pages) {
      for (let p = s; p <= e; p++) pages.add(p);
    }
    return { idx, pages };
  });

  for (const art of articles) {
    if (!isSmallFeature(art)) continue;

    const solutionPages = new Set<number>();
    for (const [s, e] of art.solution_page_ranges || []) {
      for (let p = s; p <= e; p++) solutionPages.add(p);
    }

    // Collect the article's non-solution pages
    const contentPages: number[] = [];
    for (const [s, e] of art.pdf_pages) {
      for (let p = s; p <= e; p++) {
        if (!solutionPages.has(p)) contentPages.push(p);
      }
    }

    // Check if all content pages fall within one main article's expanded range
    const containingMain = mainPageSets.find(({ pages }) =>
      contentPages.every(p => pages.has(p)),
    );

    if (containingMain && contentPages.length > 1) {
      // Interleaved: trim to start page + solution pages
      const startPage = contentPages[0];
      const newRanges: number[][] = [[startPage, startPage]];
      for (const sr of art.solution_page_ranges || []) {
        newRanges.push(sr);
      }

      const oldStr = art.pdf_pages.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
      art.pdf_pages = newRanges.sort((a, b) => a[0] - b[0]);
      const newStr = art.pdf_pages.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
      console.log(`[expand] "${art.title}": [${oldStr}] → [${newStr}] (interleaved within "${articles[containingMain.idx].title}")`);
    }
  }
}

// Maximum expected page count for known small features (problem pages only, excluding solutions)
const MAX_SMALL_FEATURE_PAGES = 3;

function annotateInterleavedArticles(articles: TocArticle[]): void {
  // Build a set of page ranges for each article
  const articlePages = articles.map(a => {
    const pages = new Set<number>();
    for (const [s, e] of a.pdf_pages) {
      for (let p = s; p <= e; p++) pages.add(p);
    }
    return pages;
  });

  // Find the longest article (likely the tournament report)
  let longestIdx = -1;
  let longestSize = 0;
  for (let i = 0; i < articles.length; i++) {
    if (articlePages[i].size > longestSize) {
      longestSize = articlePages[i].size;
      longestIdx = i;
    }
  }

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const titleLower = art.title.toLowerCase();

    // Check if this is a known small feature
    const isKnownSmall = KNOWN_INTERLEAVED.some(k => titleLower.includes(k));
    if (!isKnownSmall) continue;

    // Warn if a known small feature has a suspiciously large page count
    // (excluding solution pages which are expected to be separate)
    const problemPageCount = art.solution_page_ranges
      ? articlePages[i].size - art.solution_page_ranges.reduce((sum, [s, e]) => sum + (e - s + 1), 0)
      : articlePages[i].size;
    if (problemPageCount > MAX_SMALL_FEATURE_PAGES) {
      console.log(`[interleave] WARNING: "${art.title}" has ${problemPageCount} problem pages — expected ≤${MAX_SMALL_FEATURE_PAGES}. TOC may have given it pages belonging to the parent article.`);
    }

    // Find a larger article whose pages overlap with this one
    for (let j = 0; j < articles.length; j++) {
      if (i === j) continue;
      const other = articles[j];
      const otherLower = other.title.toLowerCase();

      // Skip if the other article is also a known small feature
      if (KNOWN_INTERLEAVED.some(k => otherLower.includes(k))) continue;

      // Check for page overlap
      let overlap = 0;
      Array.from(articlePages[i]).forEach(p => {
        if (articlePages[j].has(p)) overlap++;
      });

      if (overlap > 0 && articlePages[j].size > articlePages[i].size) {
        art.interleaved = true;
        art.parent_article = other.title;
        console.log(`[interleave] "${art.title}" is interleaved within "${other.title}" (${overlap} shared pages)`);
        break;
      }
    }

    // If no overlap found but there's a dominant long article, still mark as interleaved
    // (the TOC may have given non-overlapping ranges, but the small feature is still embedded)
    if (!art.interleaved && longestIdx >= 0 && longestIdx !== i) {
      const longest = articles[longestIdx];
      const longestLower = longest.title.toLowerCase();
      if (!KNOWN_INTERLEAVED.some(k => longestLower.includes(k))) {
        // Check if this article's pages fall within the span of the longest article
        const longestMin = Math.min(...Array.from(articlePages[longestIdx]));
        const longestMax = Math.max(...Array.from(articlePages[longestIdx]));
        const artPages = Array.from(articlePages[i]);
        const withinSpan = artPages.some(p => p >= longestMin && p <= longestMax);
        if (withinSpan) {
          art.interleaved = true;
          art.parent_article = longest.title;
          console.log(`[interleave] "${art.title}" is within span of "${longest.title}" (pages ${longestMin}-${longestMax})`);
        }
      }
    }
  }
}

function buildArticleParsePrompt(
  article: TocArticle,
  pageNums: number[],
  batchInfo?: { batchNum: number; totalBatches: number; pageNums: number[] },
  pageTexts?: string[],
  allArticles?: TocArticle[],
): string {
  // Start with the standard image article prompt (only pass batchInfo for multi-batch)
  let prompt = buildImageArticlePrompt(
    article.title,
    article.author_name,
    article.source_page,
    article.category,
    article.pdf_pages,
    batchInfo && batchInfo.totalBatches > 1 ? batchInfo : undefined,
  );

  // Add interleaved context
  if (article.interleaved && article.parent_article) {
    prompt += `\n\nSHARED PAGE CONTEXT:\nThese pages are shared with "${article.parent_article}". Extract ONLY content belonging to "${article.title}". Ignore all content from "${article.parent_article}" — it will be parsed separately.`;
  }

  // If this is a parent article with interleaved children, tell Claude to skip them
  if (allArticles) {
    const children = allArticles.filter(a => a.parent_article === article.title);
    if (children.length > 0) {
      const childList = children.map(c => `"${c.title}"`).join(", ");
      prompt += `\n\nINTERLEAVED ARTICLES TO IGNORE:\nThese smaller articles appear mid-page within your article's pages: ${childList}. Skip their content entirely — your article's text continues after each one.`;
    }
  }

  // Add solution page context for problem articles
  if (article.solution_page_ranges && article.solution_page_ranges.length > 0) {
    const problemPages = article.pdf_pages
      .filter(r => !article.solution_page_ranges!.some(sr => sr[0] === r[0] && sr[1] === r[1]))
      .map(([s, e]) => s === e ? `${s}` : `${s}-${e}`)
      .join(", ");
    const solutionPages = article.solution_page_ranges
      .map(([s, e]) => s === e ? `${s}` : `${s}-${e}`)
      .join(", ");
    prompt += `\n\nPROBLEM/SOLUTION PAGE MAP:\nPages ${problemPages} contain PROBLEMS. Pages ${solutionPages} contain SOLUTIONS. Interleave each solution immediately after its corresponding problem.`;
  }

  // Append PDF text as secondary reference
  if (pageTexts && pageTexts.length > 0) {
    const textEntries = pageNums
      .map((pn, i) => pageTexts[i] ? `───── PAGE ${pn} ─────\n${pageTexts[i]}` : null)
      .filter(Boolean)
      .join("\n\n");
    if (textEntries) {
      prompt += `\n\nEXTRACTED TEXT (secondary reference — images are authoritative):\n${textEntries}\n\nUse the IMAGES to read hand diagrams, auctions, and suit symbols. Use the TEXT for prose. When they conflict, TRUST THE IMAGES.`;
    }
  }

  return prompt;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const t0 = Date.now();

  console.log(`\n  Bridge World Issue Parser`);
  console.log(`  ========================`);
  console.log(`  Mode:   ${args.mode}`);
  console.log(`  Input:  ${args.inputPath}`);
  console.log(`  Issue:  ${args.issueName}`);
  console.log(`  Output: ${args.outputDir}`);
  console.log(`  Model:  ${MODEL}`);
  console.log();

  // Load system prompt
  if (!fs.existsSync(SYSTEM_PROMPT_PATH)) {
    console.error(`Error: System prompt not found: ${SYSTEM_PROMPT_PATH}`);
    console.error("Create docs/PARSING-PROMPT.md with the Bridge World parsing rules.");
    process.exit(1);
  }
  const systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  console.log(`  System prompt: ${SYSTEM_PROMPT_PATH} (${systemPrompt.length} chars)`);

  // Verify API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable not set.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  // Create output directory
  fs.mkdirSync(args.outputDir, { recursive: true });

  // Check for resume data
  const progressPath = getProgressPath(args.outputDir, args.issueSlug);
  const resume = loadResume(progressPath);

  // ── Prepare page images based on input mode ────────────────────────────

  let pageTexts: string[] | undefined;
  let pageMap: Map<number, PageImage> | undefined;  // For spreads/images mode
  let totalPages: number;

  if (args.mode === "pdf") {
    // Verify pdftoppm
    const pdftoppmPath = findPdftoppm();
    console.log(`  pdftoppm: ${pdftoppmPath}`);

    // Extract text from PDF
    console.log("\n[Prep] Extracting text from PDF...");
    const textT0 = Date.now();
    pageTexts = await extractPdfText(args.inputPath);
    totalPages = pageTexts.length;
    console.log(`  ${totalPages} pages extracted in ${fmtMs(Date.now() - textT0)}`);
  } else if (args.mode === "spreads") {
    console.log("\n[Prep] Scanning and splitting spread images...");
    const prepT0 = Date.now();
    const spreads = parseSpreadsFolder(args.inputPath);
    console.log(`  Found ${spreads.length} spread files`);

    if (spreads.length === 0) {
      console.error("Error: No YYYYMM-LL-RR.jpg files found in the directory.");
      process.exit(1);
    }

    pageMap = await splitSpreads(spreads);
    const allPages = Array.from(pageMap.keys()).sort((a, b) => a - b);
    totalPages = allPages[allPages.length - 1]; // Highest page number
    console.log(`  Split into ${pageMap.size} individual pages (1-${totalPages}) in ${fmtMs(Date.now() - prepT0)}`);
  } else {
    // images mode
    console.log("\n[Prep] Loading individual page images...");
    const prepT0 = Date.now();
    pageMap = await loadImageFolder(args.inputPath);
    totalPages = pageMap.size;
    console.log(`  Loaded ${totalPages} page images in ${fmtMs(Date.now() - prepT0)}`);
  }

  // Helper to get page images for any mode
  function getPageImages(pageNums: number[]): PageImage[] {
    if (args.mode === "pdf") {
      return renderPdfPages(args.inputPath, pageNums, DPI);
    }
    // spreads or images mode — look up from pre-built map
    const results: PageImage[] = [];
    for (const pn of pageNums) {
      const img = pageMap!.get(pn);
      if (img) results.push(img);
    }
    return results;
  }

  // Helper to get text for pages (PDF mode only)
  function getPageTexts(pageNums: number[]): string[] | undefined {
    if (!pageTexts) return undefined;
    return pageNums.map(pn => pageTexts![pn - 1] || "");
  }

  // ── Pass 1: TOC extraction ────────────────────────────────────────────

  let toc: { issue: IssueMeta; articles: TocArticle[] };

  if (resume?.toc) {
    console.log("\n[Pass 1] TOC loaded from resume data.");
    toc = resume.toc;
  } else {
    console.log("\n[Pass 1] Extracting TOC from first pages...");

    const tocPageNums = [1, 2, Math.min(3, totalPages)].filter((v, i, a) => a.indexOf(v) === i);
    const tocImages = getPageImages(tocPageNums);
    console.log(`  Rendered ${tocImages.length} TOC page images`);

    // Parse issue month from the --issue flag for next-month filtering
    const monthMatch = args.issueName.match(new RegExp(`(${MONTH_NAMES.slice(1).join("|")})`, "i"));
    const issueMonth = monthMatch ? MONTH_NAMES.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase()) : undefined;

    const tocPrompt = buildTocUserPrompt(args.issueName, issueMonth);
    const tocResult = await callClaude(client, systemPrompt, tocImages, tocPrompt, 8000);
    console.log(`  TOC: ${tocResult.usage.inputTokens} in / ${tocResult.usage.outputTokens} out — ${fmtUsd(tocResult.usage.costUsd)} — ${fmtMs(tocResult.usage.durationMs)}`);

    toc = extractJson(tocResult.text);

    if (!toc.issue || !Array.isArray(toc.articles)) {
      console.error("Error: TOC response missing 'issue' or 'articles'.");
      console.error("Raw:", tocResult.text.slice(0, 500));
      process.exit(1);
    }

    // Normalize pdf_pages
    for (const a of toc.articles) {
      if (!Array.isArray(a.pdf_pages) || a.pdf_pages.length === 0) {
        a.pdf_pages = [[1, totalPages]];
      }
      a.pdf_pages = a.pdf_pages
        .map(([s, e]: number[]) => {
          const start = Math.max(1, Math.min(s || 1, totalPages));
          const end = Math.max(start, Math.min(e || start, totalPages));
          return [start, end] as number[];
        })
        .sort((a: number[], b: number[]) => a[0] - b[0]);
    }

    // Merge solutions
    toc.articles = mergeProblemSolutionArticles(toc.articles);

    // Filter next-month content
    toc.articles = filterNextMonthArticles(toc.articles, toc.issue.month);

    // Fix missing solution pages for problem articles
    await fixMissingSolutionPages(toc.articles, totalPages, client, systemPrompt, getPageImages, getPageTexts);

    // Expand page ranges: main articles fill gaps, small features trimmed to start page
    expandPageRanges(toc.articles, totalPages);

    console.log(`\n  TOC: ${toc.issue.title} — ${toc.articles.length} articles`);
    for (const a of toc.articles) {
      const pages = a.pdf_pages.map(([s, e]: number[]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
      console.log(`    - "${a.title}" [${pages}] (${a.category})`);
    }
  }

  // Annotate interleaved articles
  annotateInterleavedArticles(toc.articles);

  // ── Pass 2: Article-by-article parsing ──────────────────────────────

  console.log(`\n[Pass 2] Article-by-article parsing (${PAGES_PER_ARTICLE_CALL} pages/call max)...`);

  // Load already-processed articles from resume
  const articleResults: Array<{ title: string; blocks: ContentBlock[] }> =
    resume?.articleResults || [];
  const processedArticles = new Set(articleResults.map(r => r.title));

  // Available pages for spreads/images mode
  const availablePages = pageMap ? new Set(pageMap.keys()) : null;

  const articlesToProcess = toc.articles.filter(a => !processedArticles.has(a.title));
  console.log(`  ${toc.articles.length} articles total, ${articlesToProcess.length} to process (${processedArticles.size} already done)`);

  let articleIdx = 0;
  for (const tocArticle of toc.articles) {
    articleIdx++;
    if (processedArticles.has(tocArticle.title)) continue;
    if (articleIdx > 1) await sleep(DELAY_MS);

    // Gather all page numbers for this article
    const pageNums: number[] = [];
    for (const [s, e] of tocArticle.pdf_pages) {
      for (let p = s; p <= e; p++) {
        if (!availablePages || availablePages.has(p)) {
          pageNums.push(p);
        }
      }
    }

    if (pageNums.length === 0) {
      console.log(`\n  [${articleIdx}/${toc.articles.length}] "${tocArticle.title}" — no pages available, skipping`);
      articleResults.push({ title: tocArticle.title, blocks: [] });
      continue;
    }

    console.log(`\n  [${articleIdx}/${toc.articles.length}] "${tocArticle.title}" (${pageNums.length} pages: ${pageNums.join(", ")})...`);

    // Batch pages if article spans many pages
    const pageBatches: number[][] = [];
    for (let b = 0; b < pageNums.length; b += PAGES_PER_ARTICLE_CALL) {
      pageBatches.push(pageNums.slice(b, b + PAGES_PER_ARTICLE_CALL));
    }

    const allBlocks: ContentBlock[] = [];

    for (let bi = 0; bi < pageBatches.length; bi++) {
      if (bi > 0) await sleep(DELAY_MS);

      const batchPageNums = pageBatches[bi];
      const images = getPageImages(batchPageNums);
      if (images.length === 0) {
        console.log(`    Batch ${bi + 1}/${pageBatches.length} — no images available`);
        continue;
      }

      const texts = getPageTexts(batchPageNums);
      const batchInfo = pageBatches.length > 1
        ? { batchNum: bi + 1, totalBatches: pageBatches.length, pageNums: batchPageNums }
        : undefined;

      const prompt = buildArticleParsePrompt(tocArticle, batchPageNums, batchInfo, texts, toc.articles);

      try {
        const batchLabel = pageBatches.length > 1 ? `batch ${bi + 1}/${pageBatches.length}` : "";
        const result = await callClaude(client, systemPrompt, images, prompt);

        const parsed = extractJson<{ content_blocks: ContentBlock[] }>(result.text);

        if (!Array.isArray(parsed.content_blocks)) {
          console.log(`    ${batchLabel} Warning: no content_blocks array in response`);
          continue;
        }

        for (const block of parsed.content_blocks) {
          block.id = `b${allBlocks.length + 1}`;
          allBlocks.push(block);
        }

        const blockTypes = parsed.content_blocks.map(b => b.type);
        const counts: Record<string, number> = {};
        for (const t of blockTypes) counts[t] = (counts[t] || 0) + 1;
        const countStr = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
        console.log(`    ${batchLabel ? batchLabel + ": " : ""}${parsed.content_blocks.length} blocks (${countStr})`);
        console.log(`    ${result.usage.inputTokens} in / ${result.usage.outputTokens} out — ${fmtUsd(result.usage.costUsd)} — ${fmtMs(result.usage.durationMs)}`);
      } catch (err) {
        console.error(`    Error processing "${tocArticle.title}"${pageBatches.length > 1 ? ` batch ${bi + 1}` : ""}:`, err instanceof Error ? err.message : err);
      }
    }

    articleResults.push({ title: tocArticle.title, blocks: allBlocks });
    processedArticles.add(tocArticle.title);
    saveResume(progressPath, { toc, articleResults });
  }

  // ── Pass 3: Post-processing ─────────────────────────────────────────

  console.log(`\n[Pass 3] Post-processing articles...`);

  interface OutputArticle {
    title: string;
    slug: string;
    author_name: string;
    category: string;
    tags: string[];
    level: string;
    month: number;
    year: number;
    source_page: number;
    excerpt: string;
    status: "draft";
    content_blocks: ContentBlock[];
    warnings: string[];
  }

  const outputArticles: OutputArticle[] = [];

  // Build a lookup from article results (keyed by title from Pass 2)
  const articleBlocksMap = new Map<string, ContentBlock[]>();
  for (const ar of articleResults) {
    articleBlocksMap.set(ar.title, ar.blocks);
  }

  let blockIdCounter = 1;

  for (const tocArticle of toc.articles) {
    // Blocks are already keyed by exact title from Pass 2
    let blocks = articleBlocksMap.get(tocArticle.title) || [];

    // Reassign sequential IDs
    for (const block of blocks) {
      block.id = `b${blockIdCounter++}`;
    }

    if (blocks.length === 0) {
      console.log(`  Warning: No blocks found for "${tocArticle.title}"`);
      outputArticles.push({
        title: tocArticle.title,
        slug: slugify(tocArticle.title),
        author_name: tocArticle.author_name,
        category: mapCategory(tocArticle.category) || inferCategoryFromTitle(tocArticle.title) || tocArticle.category,
        tags: tocArticle.tags,
        level: inferLevel(tocArticle.category, tocArticle.tags),
        month: toc.issue.month,
        year: toc.issue.year,
        source_page: tocArticle.source_page,
        excerpt: tocArticle.excerpt,
        status: "draft",
        content_blocks: [],
        warnings: ["No content blocks found"],
      });
      continue;
    }

    const warnings: string[] = [];

    // Post-process: normalize tens
    blocks = normalizeTens(blocks);

    // Auto-fix hands
    const { blocks: fixedBlocks, fixes, manualReviewFlags } = autoFixContentBlocks(blocks);
    if (fixes.length > 0) {
      blocks = fixedBlocks;
      console.log(`  Auto-fixed ${fixes.length} hand(s) in "${tocArticle.title}"`);
    }
    for (const flag of manualReviewFlags) {
      warnings.push(`Manual review: ${flag.direction} in block ${flag.blockId}: ${flag.reason}`);
    }

    // Auto-fix auctions
    const { blocks: auctionFixed, fixes: auctionFixes } = autoFixAuctions(blocks);
    if (auctionFixes.length > 0) {
      blocks = auctionFixed;
      console.log(`  Auto-fixed ${auctionFixes.length} auction(s) in "${tocArticle.title}"`);
    }

    // Fix MSC auctions: ensure "?" lands on South's seat
    if (tocArticle.category.toLowerCase().includes("master solvers")) {
      const { blocks: mscFixed, fixes: mscFixes } = fixMscAuctions(blocks);
      if (mscFixes.length > 0) {
        blocks = mscFixed;
        for (const f of mscFixes) console.log(`  MSC fix: ${f}`);
      }
    }

    // Strip next-month content from within articles
    const { blocks: monthStripped, stripped: monthStrippedCount } = stripNextMonthBlocks(blocks, toc.issue.month);
    if (monthStrippedCount > 0) {
      blocks = monthStripped;
      console.log(`  Stripped ${monthStrippedCount} next-month block(s) from "${tocArticle.title}"`);
    }

    // Strip boilerplate blocks
    const { blocks: noBoilerplate, stripped: boilerStripped } = stripBoilerplateBlocks(blocks);
    if (boilerStripped > 0) {
      blocks = noBoilerplate;
      console.log(`  Stripped ${boilerStripped} boilerplate block(s) from "${tocArticle.title}"`);
    }

    // Strip cross-references (print artifacts like "Solution on page 73")
    const { blocks: noCrossRef, stripped: crossRefStripped } = stripCrossReferences(blocks);
    if (crossRefStripped > 0) {
      blocks = noCrossRef;
      console.log(`  Stripped cross-references from ${crossRefStripped} block(s) in "${tocArticle.title}"`);
    }

    // Interleave solutions
    const interleave = interleaveProblemSolutions(blocks);
    if (interleave.solutionCount > 0) {
      blocks = interleave.blocks;
      console.log(`  Wrapped ${interleave.solutionCount} solution(s) in "${tocArticle.title}"`);
    }

    // Validate
    const blockErrors = validateContentBlocks(blocks);
    for (const be of blockErrors) {
      for (const e of be.errors) {
        warnings.push(`Block ${be.blockIndex} (${be.blockType}): ${e}`);
      }
    }

    const typeCounts: Record<string, number> = {};
    for (const b of blocks) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
    console.log(`  "${tocArticle.title}": ${blocks.length} blocks (${Object.entries(typeCounts).map(([k, v]) => `${v} ${k}`).join(", ")})${warnings.length > 0 ? ` — ${warnings.length} warning(s)` : ""}`);

    // Apply category mapping and inference
    let category = tocArticle.category
      ? mapCategory(tocArticle.category)
      : inferCategoryFromTitle(tocArticle.title) ?? "";
    if (!category) category = tocArticle.category;

    const level = inferLevel(category, tocArticle.tags);

    outputArticles.push({
      title: tocArticle.title,
      slug: slugify(tocArticle.title),
      author_name: tocArticle.author_name,
      category,
      tags: tocArticle.tags,
      level,
      month: toc.issue.month,
      year: toc.issue.year,
      source_page: tocArticle.source_page,
      excerpt: tocArticle.excerpt,
      status: "draft",
      content_blocks: blocks,
      warnings,
    });
  }

  // ── Write output ────────────────────────────────────────────────────

  console.log(`\n[Output] Writing to ${args.outputDir}/`);

  // Write individual article files (prefixed with issue slug)
  for (const article of outputArticles) {
    const filename = `${args.issueSlug}-${article.slug}.json`;
    const articlePath = path.join(args.outputDir, filename);
    fs.writeFileSync(articlePath, JSON.stringify(article, null, 2));
  }

  // Write issue summary
  const issueSummary = {
    issue: toc.issue,
    articles: outputArticles.map(a => ({
      title: a.title,
      slug: a.slug,
      author_name: a.author_name,
      category: a.category,
      tags: a.tags,
      level: a.level,
      month: a.month,
      year: a.year,
      source_page: a.source_page,
      excerpt: a.excerpt,
      block_count: a.content_blocks.length,
      warnings: a.warnings,
    })),
    stats: {
      totalDurationMs: Date.now() - t0,
      apiCalls: apiCallCount,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      costUsd: totalUsage.costUsd,
    },
  };

  const summaryPath = path.join(args.outputDir, `${args.issueSlug}-issue.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(issueSummary, null, 2));

  // Clean up progress file on successful completion
  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
    console.log(`  Cleaned up progress file`);
  }

  // ── Summary ─────────────────────────────────────────────────────────

  const totalMs = Date.now() - t0;
  console.log(`
  ══════════════════════════════════════
  DONE in ${fmtMs(totalMs)}
  Mode:          ${args.mode}
  API calls:     ${apiCallCount}
  Input tokens:  ${totalUsage.inputTokens.toLocaleString()}
  Output tokens: ${totalUsage.outputTokens.toLocaleString()}
  Est. cost:     ${fmtUsd(totalUsage.costUsd)}
  Articles:      ${outputArticles.length}
  Total blocks:  ${outputArticles.reduce((s, a) => s + a.content_blocks.length, 0)}
  Output:        ${args.outputDir}/
  ══════════════════════════════════════
`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
