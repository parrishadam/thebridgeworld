/**
 * Plain-text bridge parser.
 *
 * Converts text pasted from PDFs or Word documents into structured
 * BridgeHandBlock and BiddingTableBlock content-block data.
 *
 * Client-safe — no server-only imports.
 */
import type { Direction, HandCards, BridgeHandBlock, BiddingTableBlock } from "@/types";

// ── Public result types ─────────────────────────────────────────────────────

export type ParsedItem =
  | { kind: "hand"; data: BridgeHandBlock["data"] }
  | { kind: "auction"; data: BiddingTableBlock["data"]; isBiddingProblem: boolean }
  | { kind: "text"; text: string };

export interface ParseTextResult {
  items: ParsedItem[];
  encodingFixed: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SYMBOL_TO_SUIT: Record<string, keyof HandCards> = {
  "♠": "S", "♥": "H", "♦": "D", "♣": "C",
};

const DIR_LABELS: Record<string, Direction> = {
  north: "north", south: "south", east: "east", west: "west",
  n: "north", s: "south", e: "east", w: "west",
};

// ── PDF encoding fix ────────────────────────────────────────────────────────

/**
 * Detect garbled Bridge World PDF font encoding (8→♠, 5→♥, 7→♦, 6→♣)
 * and fix it.  Only fixes lines that look like hand data; prose text with
 * those digits is left alone.
 */
export function detectAndFixEncoding(text: string): { text: string; fixed: boolean } {
  if (/[♠♥♦♣]/.test(text)) return { text, fixed: false };

  const lines = text.split("\n");
  // A "garbled" line has a digit 5/6/7/8 immediately followed by card ranks
  const isGarbled = (l: string) => /[5678][AKQJT2-9]/.test(l);
  const garbledCount = lines.filter(isGarbled).length;

  if (garbledCount >= 2) {
    const fixed = lines
      .map((l) =>
        isGarbled(l)
          ? l.replace(/8/g, "♠").replace(/5/g, "♥").replace(/7/g, "♦").replace(/6/g, "♣")
          : l,
      )
      .join("\n");
    return { text: fixed, fixed: true };
  }
  return { text, fixed: false };
}

// ── Bid normalisation ───────────────────────────────────────────────────────

/**
 * Convert one raw bid token (display form) to stored format.
 * Display form uses suit symbols (1♠, 2♥) or letters (1S, 2H).
 * Stored format uses letters (1S, 2H, 3NT, Pass, Dbl, Rdbl).
 * Returns null for unrecognised tokens.
 */
export function normalizeBid(raw: string): string | null {
  if (!raw) return null;
  // Strip annotation characters but NOT "?" (handled by caller)
  const s = raw.trim().replace(/[!*=;]+$/, "");
  const noQ = s.replace(/\?+$/, "").trim();
  if (!noQ) return null;
  const u = noQ.toUpperCase();

  if (u === "PASS" || u === "P") return "Pass";
  if (noQ === "-") return "Pass"; // dash = pass in many formats
  if (u === "DBL" || u === "X" || u === "DOUBLE") return "Dbl";
  if (u === "RDBL" || u === "XX" || u === "REDOUBLE") return "Rdbl";
  if (u === "AP") return "AP"; // all-pass sentinel

  // Symbol bids: 1♠ 2♥ 3♦ 4♣ 3NT
  const symMatch = noQ.match(/^([1-7])\s*(♠|♥|♦|♣|NT|nt)$/i);
  if (symMatch) {
    const level = symMatch[1];
    const sym = symMatch[2].toUpperCase();
    if (sym === "NT") return `${level}NT`;
    const suit = SYMBOL_TO_SUIT[sym];
    if (suit) return `${level}${suit}`;
  }

  // Letter bids: 1S 2H 3D 4C 3NT (also 3N)
  const letterMatch = u.match(/^([1-7])(S|H|D|C|NT|N)$/);
  if (letterMatch) {
    return `${letterMatch[1]}${letterMatch[2] === "N" ? "NT" : letterMatch[2]}`;
  }

  return null;
}

// ── Card rank helpers ───────────────────────────────────────────────────────

function parseSuitRanks(raw: string): string {
  return raw.replace(/10/g, "T").replace(/[^AKQJTakqjt98765432]/g, "").toUpperCase();
}

// ── Hand string parser ──────────────────────────────────────────────────────

/**
 * Parse a hand string that contains suit symbols followed by card ranks.
 * Handles formats like:
 *   "♠ A K Q  ♥ J 5  ♦ K 9 8 7  ♣ Q J T"
 *   "♠AKQ ♥J5 ♦K987 ♣QJT"
 * Returns a partial HandCards (only suits present in the string are set).
 */
export function parseHandString(raw: string): Partial<HandCards> | null {
  const result: Partial<HandCards> = {};
  let found = 0;

  // Match each suit symbol then grab everything up to the next suit symbol or end
  const re = /(♠|♥|♦|♣)\s*((?:[AKQJTakqjt2-9]|10|\s)*?)(?=♠|♥|♦|♣|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const suit = SYMBOL_TO_SUIT[m[1]];
    if (suit) {
      result[suit] = parseSuitRanks(m[2]);
      found++;
    }
  }

  return found > 0 ? result : null;
}

// ── Hand data helpers ───────────────────────────────────────────────────────

function makeDefaultHands(): Record<Direction, HandCards> {
  const empty: HandCards = { S: "", H: "", D: "", C: "" };
  return {
    north: { ...empty },
    south: { ...empty },
    east:  { ...empty },
    west:  { ...empty },
  };
}

function makeHandCards(partial: Partial<HandCards>): HandCards {
  return { S: "", H: "", D: "", C: "", ...partial };
}

// ── Labeled hand parser ─────────────────────────────────────────────────────

/**
 * Parse deal data from lines that have direction labels followed by suit lines.
 *
 * Supported formats:
 *   North               North: ♠AKQ ♥J5 ♦K987 ♣QJT
 *   ♠ AKQ
 *   ♥ J5
 *   …
 */
export function parseDeal(lines: string[]): Record<Direction, HandCards> | null {
  const hands = makeDefaultHands();
  let found = 0;
  let currentDir: Direction | null = null;
  const currentSuits: Partial<HandCards> = {};

  function flush() {
    if (currentDir && Object.keys(currentSuits).length > 0) {
      hands[currentDir] = makeHandCards(currentSuits);
      found++;
      (["S", "H", "D", "C"] as const).forEach((k) => delete currentSuits[k]);
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Direction label on its own line: "North" "S" etc.
    const standalone = line.toLowerCase().match(/^(north|south|east|west|[nsew])[\s:]*$/);
    if (standalone && DIR_LABELS[standalone[1]]) {
      flush();
      currentDir = DIR_LABELS[standalone[1]];
      continue;
    }

    // Direction: hand on same line — "North: ♠AKQ ♥J5…"
    const inline = line.toLowerCase().match(/^(north|south|east|west|[nsew])\s*[:\-]\s*(.*)/);
    if (inline && DIR_LABELS[inline[1]]) {
      flush();
      currentDir = DIR_LABELS[inline[1]];
      const partial = parseHandString(inline[2]);
      if (partial) Object.assign(currentSuits, partial);
      continue;
    }

    // Suit line: "♠ AKQ"
    const suitLine = line.match(/^(♠|♥|♦|♣)\s*(.*)/);
    if (suitLine && currentDir) {
      const suit = SYMBOL_TO_SUIT[suitLine[1]];
      if (suit) currentSuits[suit] = parseSuitRanks(suitLine[2]);
      continue;
    }

    // Multi-suit on one line: "♠AKQ ♥J5 ♦K987 ♣QJT"
    if (currentDir && /[♠♥♦♣]/.test(line)) {
      const partial = parseHandString(line);
      if (partial) Object.assign(currentSuits, partial);
    }
  }
  flush();

  return found > 0 ? hands : null;
}

// ── Compass grid parser ─────────────────────────────────────────────────────

/**
 * Parse a compass-grid hand diagram where North is at the top, West on the
 * left, East on the right, and South at the bottom.  Falls back to the
 * labeled-hand parser when explicit direction keywords are present.
 */
export function parseGridFormat(lines: string[]): Record<Direction, HandCards> | null {
  // Strategy 1 – explicit direction labels (handles most real-world cases)
  const labeled = parseDeal(lines);
  if (labeled) {
    const nonEmpty = Object.values(labeled).filter(
      (h) => h.S || h.H || h.D || h.C,
    );
    if (nonEmpty.length >= 2) return labeled;
  }

  // Strategy 2 – spatial grid: collect groups of suit-lines by indentation
  return parseSpatialGrid(lines);
}

interface SuitGroup {
  indent: number;
  suits: Partial<HandCards>;
}

function parseSpatialGrid(lines: string[]): Record<Direction, HandCards> | null {
  const groups: SuitGroup[] = [];
  let current: SuitGroup | null = null;

  for (const rawLine of lines) {
    const m = rawLine.match(/^(\s*)(♠|♥|♦|♣)\s*(.*)/);
    if (m) {
      const indent = m[1].length;
      const suit = SYMBOL_TO_SUIT[m[2]];
      const ranks = parseSuitRanks(m[3]);

      if (!current || Math.abs(current.indent - indent) > 4) {
        if (current) groups.push(current);
        current = { indent, suits: {} };
      }
      if (suit) current.suits[suit] = ranks;
    } else {
      if (current && Object.keys(current.suits).length > 0) {
        groups.push(current);
        current = null;
      }
    }
  }
  if (current && Object.keys(current.suits).length > 0) groups.push(current);

  if (groups.length < 3) return null;

  const hands = makeDefaultHands();

  if (groups.length >= 4) {
    // Assume N, W, E, S order
    hands.north = makeHandCards(groups[0].suits);
    hands.west  = makeHandCards(groups[1].suits);
    hands.east  = makeHandCards(groups[2].suits);
    hands.south = makeHandCards(groups[3].suits);
    return hands;
  }

  if (groups.length === 3) {
    // Assume N, center (W+E mixed), S — assign by indent comparison
    // Fall back to positional assignment.
    hands.north = makeHandCards(groups[0].suits);
    hands.south = makeHandCards(groups[2].suits);
    // Middle group: treat as West for now
    hands.west  = makeHandCards(groups[1].suits);
    return hands;
  }

  return null;
}

// ── Auction close helper ────────────────────────────────────────────────────

type Bid = { text: string; alert: string | null };

/**
 * Append closing passes to an auction if it isn't already finished.
 * A contract bid requires 3 consecutive passes; a passed-out hand needs 4.
 */
function autoCloseBids(bids: Bid[]): Bid[] {
  if (bids.length === 0) return bids;

  const hasContractBid = bids.some(
    (b) => !["Pass", "Dbl", "Rdbl"].includes(b.text),
  );

  // Count trailing passes
  let trailing = 0;
  for (let i = bids.length - 1; i >= 0; i--) {
    if (bids[i].text === "Pass") trailing++;
    else break;
  }

  const result = [...bids];

  if (hasContractBid) {
    while (trailing < 3) {
      result.push({ text: "Pass", alert: null });
      trailing++;
    }
  } else {
    // Passed-out board: 4 total passes
    while (result.length < 4) {
      result.push({ text: "Pass", alert: null });
    }
  }

  return result;
}

// ── Compact auction parser ──────────────────────────────────────────────────

/**
 * Parse a compact (flat) auction — bids separated by whitespace, with an
 * optional "?" at the end to mark a bidding problem.
 *
 * Auctions ending with "?" are bidding problems: closing passes are NOT added.
 * Otherwise, passes are appended to close the auction properly.
 *
 * @param text   Raw bid string, e.g. "1♠ P 2NT P 3♠ P 4♠"
 * @param dealer Dealer seat for the block (default "North")
 */
export function parseCompactAuction(
  text: string,
  dealer: string = "North",
): { bids: Bid[]; dealer: string; isBiddingProblem: boolean } | null {
  const tokens = text.trim().split(/[\s,|/]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const lastToken = tokens[tokens.length - 1];
  const isBiddingProblem = lastToken.trim() === "?";
  const bidTokens = isBiddingProblem ? tokens.slice(0, -1) : tokens;

  const bids: Bid[] = [];
  for (const tok of bidTokens) {
    const norm = normalizeBid(tok);
    if (norm === null) return null; // unrecognised token → this isn't an auction
    if (norm === "AP") {
      bids.push({ text: "Pass", alert: null });
      bids.push({ text: "Pass", alert: null });
      bids.push({ text: "Pass", alert: null });
    } else {
      bids.push({ text: norm, alert: null });
    }
  }

  if (bids.length === 0) return null;

  const finalBids = isBiddingProblem ? bids : autoCloseBids(bids);
  return { bids: finalBids, dealer, isBiddingProblem };
}

// ── Grid auction parser ─────────────────────────────────────────────────────

// Column orderings we recognise in the first header line
const COLUMN_PATTERNS: Array<{ re: RegExp; dirs: string[] }> = [
  {
    re: /\bW\b.*\bN\b.*\bE\b.*\bS\b|\bWest\b.*\bNorth\b.*\bEast\b.*\bSouth\b/i,
    dirs: ["West", "North", "East", "South"],
  },
  {
    re: /\bN\b.*\bE\b.*\bS\b.*\bW\b|\bNorth\b.*\bEast\b.*\bSouth\b.*\bWest\b/i,
    dirs: ["North", "East", "South", "West"],
  },
  {
    re: /\bS\b.*\bW\b.*\bN\b.*\bE\b|\bSouth\b.*\bWest\b.*\bNorth\b.*\bEast\b/i,
    dirs: ["South", "West", "North", "East"],
  },
];

/**
 * Parse a W-N-E-S grid auction table.
 *
 * The optional first line may contain column headers (W N E S or full names).
 * Subsequent lines contain bids, one per column, separated by whitespace.
 * A "-" cell means the seat passes.  An empty cell ends that row's bids.
 * A "?" cell marks the end as a bidding problem.
 */
export function parseAuction(
  lines: string[],
  defaultDealer: string = "North",
): { bids: Bid[]; dealer: string; isBiddingProblem: boolean } | null {
  if (lines.length === 0) return null;

  // ── Detect column headers ──
  let columns = ["West", "North", "East", "South"];
  let dataLines = lines;

  const firstLine = lines[0].trim();
  for (const { re, dirs } of COLUMN_PATTERNS) {
    if (re.test(firstLine)) {
      columns = dirs;
      dataLines = lines.slice(1);
      break;
    }
  }

  // ── Collect all grid cells in reading order ──
  interface Cell { dir: string; raw: string }
  const allCells: Cell[] = [];

  for (const rawLine of dataLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Split by tab(s) or 2+ spaces; fall back to single spaces for short lines
    const parts = line.includes("\t")
      ? line.split(/\t+/)
      : line.split(/\s{2,}/).length > 1
        ? line.split(/\s{2,}/)
        : line.split(/\s+/);

    const cells = parts.map((c) => c.trim());
    for (let col = 0; col < columns.length; col++) {
      allCells.push({ dir: columns[col], raw: cells[col] ?? "" });
    }
  }

  if (allCells.length === 0) return null;

  // ── Find the dealer (first non-empty, non-"-" cell) ──
  let startIdx = -1;
  let dealer = defaultDealer;

  for (let i = 0; i < allCells.length; i++) {
    const raw = allCells[i].raw.trim();
    if (raw && raw !== "-") {
      const norm = normalizeBid(raw);
      if (norm !== null || raw === "?") {
        startIdx = i;
        // The column of the first non-empty cell is the dealer
        dealer = columns[i % columns.length];
        break;
      }
    }
  }

  if (startIdx === -1) return null;

  // ── Collect bids from startIdx ──
  const bids: Bid[] = [];
  let isBiddingProblem = false;

  for (let i = startIdx; i < allCells.length; i++) {
    const raw = allCells[i].raw.trim();

    if (!raw) continue; // empty trailing cell — skip

    if (raw === "?") {
      isBiddingProblem = true;
      break;
    }

    if (raw === "-") {
      // Dash = explicit pass in the auction (only valid after dealer)
      bids.push({ text: "Pass", alert: null });
      continue;
    }

    const norm = normalizeBid(raw);
    if (norm === null) continue; // unrecognised — skip

    if (norm === "AP") {
      bids.push({ text: "Pass", alert: null });
      bids.push({ text: "Pass", alert: null });
      bids.push({ text: "Pass", alert: null });
    } else {
      bids.push({ text: norm, alert: null });
    }
  }

  if (bids.length === 0) return null;

  const finalBids = isBiddingProblem ? bids : autoCloseBids(bids);
  return { bids: finalBids, dealer, isBiddingProblem };
}

// ── Detection helpers ───────────────────────────────────────────────────────

function looksLikeHand(text: string): boolean {
  // Must have suit symbols followed by card ranks
  return /[♠♥♦♣]\s*[AKQJT2-9]/.test(text);
}

function looksLikeGridAuction(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const first = lines[0].trim();
  return COLUMN_PATTERNS.some(({ re }) => re.test(first));
}

function looksLikeCompactAuction(text: string): boolean {
  // Must not look like hand data
  if (looksLikeHand(text)) return false;
  // Must not have direction labels followed by suit lines
  if (/\b(north|south|east|west)\b/i.test(text) && /[♠♥♦♣]/.test(text)) return false;

  const tokens = text.trim().split(/[\s,|/]+/).filter(Boolean);
  if (tokens.length < 1) return false;

  // At least 1 real bid token (not just "?")
  let validBids = 0;
  for (const tok of tokens) {
    if (tok === "?") continue;
    if (normalizeBid(tok) !== null) validBids++;
  }

  // Require ≥80% of tokens to be valid bids (allows for some annotation noise)
  return validBids >= 1 && validBids / tokens.length >= 0.8;
}

// ── Build block data ────────────────────────────────────────────────────────

function buildHandData(
  deal: Record<Direction, HandCards>,
): BridgeHandBlock["data"] {
  const dirs: Direction[] = ["north", "south", "east", "west"];
  const visibleHands = {} as Record<Direction, boolean>;
  for (const d of dirs) {
    const h = deal[d];
    visibleHands[d] = !!(h.S || h.H || h.D || h.C);
  }
  return {
    title: "",
    dealer: "North",
    vulnerability: "None",
    contract: "",
    lead: "",
    hands: deal,
    visibleHands,
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Parse arbitrary bridge text (from PDFs, Word docs, etc.) into structured
 * content-block data.
 *
 * The function:
 *   1. Auto-detects and fixes Bridge World PDF font encoding
 *   2. Splits the text into blank-line-separated paragraphs
 *   3. Classifies each paragraph as a hand, an auction, or plain text
 *   4. Returns an array of ParsedItem ready for the editor to insert
 */
export function parseText(raw: string): ParseTextResult {
  // 1. Encoding fix
  const { text, fixed } = detectAndFixEncoding(raw);

  // 2. Split into paragraphs
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];

  for (const para of paragraphs) {
    const lines = para.split("\n");

    // ── Try hand ──
    if (looksLikeHand(para)) {
      const deal = parseGridFormat(lines);
      if (deal) {
        const nonEmpty = Object.values(deal).filter((h) => h.S || h.H || h.D || h.C);
        if (nonEmpty.length > 0) {
          items.push({ kind: "hand", data: buildHandData(deal) });
          continue;
        }
      }
    }

    // ── Try grid auction ──
    if (looksLikeGridAuction(lines)) {
      const result = parseAuction(lines);
      if (result) {
        items.push({
          kind: "auction",
          data: { dealer: result.dealer, bids: result.bids },
          isBiddingProblem: result.isBiddingProblem,
        });
        continue;
      }
    }

    // ── Try compact auction ──
    if (looksLikeCompactAuction(para)) {
      const result = parseCompactAuction(para);
      if (result) {
        items.push({
          kind: "auction",
          data: { dealer: result.dealer, bids: result.bids },
          isBiddingProblem: result.isBiddingProblem,
        });
        continue;
      }
    }

    // ── Fall back to text ──
    items.push({ kind: "text", text: para });
  }

  return { items, encodingFixed: fixed };
}
