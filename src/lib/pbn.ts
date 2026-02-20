/**
 * PBN (Portable Bridge Notation) parser.
 *
 * Supports tag-value pairs ([Tag "value"]) plus the [Auction] section where
 * bids appear on lines after the tag.  Designed to be tolerant of whitespace
 * variations, partial snippets, and common annotation characters.
 *
 * Client-safe — no server-only imports.
 */
import type { Direction, HandCards } from "@/types";

// ── Seat mappings ──────────────────────────────────────────────────────────

const DEALER_MAP: Record<string, string> = {
  N: "North", E: "East", S: "South", W: "West",
};

/**
 * Seats in clockwise order starting from the given first seat.
 * Used to map the four Deal hand-strings to compass directions.
 */
const CLOCKWISE_FROM: Record<string, Direction[]> = {
  N: ["north", "east", "south", "west"],
  E: ["east",  "south", "west",  "north"],
  S: ["south", "west",  "north", "east"],
  W: ["west",  "north", "east",  "south"],
};

// ── Tag helpers ────────────────────────────────────────────────────────────

/** Return the value of [TagName "..."], or undefined if absent. */
function getTag(pbn: string, name: string): string | undefined {
  const m = pbn.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`, "i"));
  return m?.[1];
}

/** Return the tag value AND the character index immediately after the ]. */
function getTagWithEnd(
  pbn: string,
  name: string,
): { value: string; end: number } | undefined {
  const m = new RegExp(`\\[${name}\\s+"([^"]*)"\\]`, "i").exec(pbn);
  if (!m) return undefined;
  return { value: m[1], end: m.index! + m[0].length };
}

// ── Vulnerability ──────────────────────────────────────────────────────────

function parseVulnerability(raw: string): string {
  switch (raw.trim().toUpperCase()) {
    case "NS":   case "N":            return "N-S";
    case "EW":   case "E":            return "E-W";
    case "BOTH": case "ALL": case "B": return "All";
    default:                           return "None";
  }
}

// ── Deal ───────────────────────────────────────────────────────────────────

function parseDeal(
  raw: string,
): Record<Direction, HandCards> | null {
  const colon = raw.indexOf(":");
  if (colon === -1) return null;

  const firstSeat = raw[0].toUpperCase();
  const order = CLOCKWISE_FROM[firstSeat];
  if (!order) return null;

  // Four hand strings separated by whitespace
  const parts = raw.slice(colon + 1).trim().split(/\s+/);
  if (parts.length !== 4) return null;

  const result = {} as Record<Direction, HandCards>;

  for (let i = 0; i < 4; i++) {
    const suits = parts[i].split(".");
    if (suits.length !== 4) return null;

    result[order[i]] = {
      S: suits[0] === "-" ? "" : suits[0].toUpperCase(),
      H: suits[1] === "-" ? "" : suits[1].toUpperCase(),
      D: suits[2] === "-" ? "" : suits[2].toUpperCase(),
      C: suits[3] === "-" ? "" : suits[3].toUpperCase(),
    };
  }

  return result;
}

// ── Contract ───────────────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<string, string> = {
  C: "♣", D: "♦", H: "♥", S: "♠",
};

/**
 * Convert a PBN contract string ("3SX", "6NTX", "Pass" …) to display form.
 * Returns empty string for a passed-out board.
 */
function parseContract(raw: string): string {
  if (!raw || /^pass$/i.test(raw.trim())) return "";

  let s = raw.trim().toUpperCase();
  let suffix = "";

  if (s.endsWith("XX")) { suffix = " Rdbl"; s = s.slice(0, -2); }
  else if (s.endsWith("X")) { suffix = " Dbl";  s = s.slice(0, -1); }

  const level = s[0];
  const denom = s.slice(1);
  const display = denom === "NT" ? "NT" : (SUIT_SYMBOL[denom] ?? denom);

  return level + display + suffix;
}

// ── Auction token normaliser ───────────────────────────────────────────────

/**
 * Convert one raw PBN auction token to our stored bid format, or null to skip.
 * Returns "AP" as a special sentinel (caller expands to 3 passes).
 */
function normToken(tok: string): string | null {
  // Strip trailing annotation characters (!, ?, =, ;) and leading/trailing space
  const clean = tok.replace(/[!?=;*]+$/, "").trim();
  if (!clean) return null;

  const u = clean.toUpperCase();

  if (u === "PASS" || u === "P") return "Pass";
  if (u === "X")                  return "Dbl";
  if (u === "XX")                 return "Rdbl";
  if (u === "AP")                 return "AP";   // all-pass shorthand

  // Suit / NT bids: [1-7] followed by C D H S NT (or N → NT)
  const m = u.match(/^([1-7])(C|D|H|S|NT|N)$/);
  if (m) return `${m[1]}${m[2] === "N" ? "NT" : m[2]}`;

  return null; // unknown — skip silently
}

function parseAuctionText(
  text: string,
): Array<{ text: string; alert: string | null }> {
  // Remove PBN inline comments {…}
  const clean = text.replace(/\{[^}]*\}/g, " ");

  const bids: Array<{ text: string; alert: string | null }> = [];

  for (const tok of clean.split(/[\s,;|]+/)) {
    const norm = normToken(tok);
    if (!norm) continue;

    if (norm === "AP") {
      // Expand "All Pass" to three passes
      bids.push({ text: "Pass", alert: null });
      bids.push({ text: "Pass", alert: null });
      bids.push({ text: "Pass", alert: null });
    } else {
      bids.push({ text: norm, alert: null });
    }
  }

  return bids;
}

// ── Public types ───────────────────────────────────────────────────────────

export interface ParsedPBN {
  /** Board number string from [Board "1"], if present. */
  board?: string;
  /** "North" | "South" | "East" | "West" */
  dealer?: string;
  /** "None" | "N-S" | "E-W" | "All" */
  vulnerability?: string;
  /** Parsed hands indexed by compass direction. */
  deal?: Record<Direction, HandCards>;
  /** Display-form contract string, e.g. "3♠ Dbl". */
  contract?: string;
  /** Seat code of the declarer: "N" | "E" | "S" | "W". */
  declarer?: string;
  /** Parsed auction ready to drop into a BiddingTableBlock. */
  auction?: {
    dealer: string;
    bids: Array<{ text: string; alert: string | null }>;
  };
  /**
   * Free-text commentary extracted from all {…} sections in the deal chunk.
   * Multiple comment blocks are joined with a blank line.
   * BridgeComposer suit escapes (\S \H \D \C) are converted to symbols.
   */
  commentary?: string;
}

export type PBNResult =
  | { ok: true;  data: ParsedPBN }
  | { ok: false; error: string };

// ── Commentary ─────────────────────────────────────────────────────────────

/**
 * Extract all {…} commentary sections from a raw PBN chunk.
 * Each block is trimmed; BridgeComposer backslash suit escapes are replaced
 * with Unicode symbols.  Empty blocks are discarded.  Multiple blocks are
 * joined with a blank line so they read as separate paragraphs.
 * Returns undefined when no non-empty commentary is found.
 */
function parseCommentary(raw: string): string | undefined {
  const blocks: string[] = [];
  // [^}]* matches any character except }, including newlines, so this handles
  // multi-line comments without needing the dotAll flag.
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const text = m[1]
      .replace(/\\S/g, "♠")
      .replace(/\\H/g, "♥")
      .replace(/\\D/g, "♦")
      .replace(/\\C/g, "♣")
      .trim();
    if (text) blocks.push(text);
  }
  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
}

// ── Main entry point ───────────────────────────────────────────────────────

export function parsePBN(raw: string): PBNResult {
  if (!raw.trim()) {
    return { ok: false, error: "Input is empty." };
  }

  const pbn: ParsedPBN = {};

  // ── [Board] ─────────────────────────────────────────────────────────────
  const boardRaw = getTag(raw, "Board");
  if (boardRaw) pbn.board = boardRaw.trim();

  // ── [Dealer] ────────────────────────────────────────────────────────────
  const dealerRaw = getTag(raw, "Dealer");
  if (dealerRaw) {
    pbn.dealer = DEALER_MAP[dealerRaw.trim().toUpperCase()] ?? "North";
  }

  // ── [Vulnerable] ────────────────────────────────────────────────────────
  const vulRaw = getTag(raw, "Vulnerable");
  if (vulRaw) {
    pbn.vulnerability = parseVulnerability(vulRaw);
  }

  // ── [Deal] ──────────────────────────────────────────────────────────────
  const dealRaw = getTag(raw, "Deal");
  if (dealRaw) {
    const hands = parseDeal(dealRaw);
    if (!hands) {
      return {
        ok: false,
        error:
          'Could not parse [Deal]. Expected "FirstSeat:S.H.D.C S.H.D.C S.H.D.C S.H.D.C" with four hands.',
      };
    }
    pbn.deal = hands;
  }

  // ── [Contract] ──────────────────────────────────────────────────────────
  const contractRaw = getTag(raw, "Contract");
  if (contractRaw) {
    pbn.contract = parseContract(contractRaw);
  }

  // ── [Declarer] ──────────────────────────────────────────────────────────
  const declarerRaw = getTag(raw, "Declarer");
  if (declarerRaw) {
    const seat = declarerRaw.trim().toUpperCase();
    if (seat === "N" || seat === "E" || seat === "S" || seat === "W") {
      pbn.declarer = seat;
    }
  }

  // ── [Auction] ───────────────────────────────────────────────────────────
  // The [Auction "Dealer"] tag's value is the dealer initial; the actual bids
  // follow on subsequent lines outside the bracket, until the next tag.
  const auctionTag = getTagWithEnd(raw, "Auction");
  if (auctionTag) {
    const auctionDealer =
      DEALER_MAP[auctionTag.value.trim().toUpperCase()] ??
      pbn.dealer ??
      "North";

    const afterTag   = raw.slice(auctionTag.end);
    const nextBracket = afterTag.indexOf("[");
    const auctionText = nextBracket === -1 ? afterTag : afterTag.slice(0, nextBracket);
    const bids        = parseAuctionText(auctionText);

    if (bids.length > 0) {
      pbn.auction = { dealer: auctionDealer, bids };
    }

    // Propagate auction dealer if no [Dealer] tag was present
    if (!pbn.dealer) {
      pbn.dealer = auctionDealer;
    }
  }

  // ── Commentary ──────────────────────────────────────────────────────────
  const commentary = parseCommentary(raw);
  if (commentary) pbn.commentary = commentary;

  // ── Require at least one useful field ───────────────────────────────────
  if (!pbn.dealer && !pbn.deal && !pbn.auction) {
    return {
      ok: false,
      error:
        "No recognisable PBN tags found. " +
        "Paste at least one of [Dealer], [Deal], or [Auction].",
    };
  }

  return { ok: true, data: pbn };
}

// ── Multi-deal helpers ──────────────────────────────────────────────────────

/**
 * Split a raw PBN string into individual per-deal strings.
 *
 * Handles both blank-line-separated PBN and the compact BridgeComposer format
 * where deals run together with no blank lines between them.
 *
 * Rules applied line by line:
 *  - Lines starting with % are BridgeComposer metadata and are skipped.
 *  - A new deal starts when [Board], [Event], or [Site] is encountered AND
 *    the current chunk already contains substantive deal content ([Board],
 *    [Deal], or [Auction] has been seen).  This prevents a false split when
 *    [Site] immediately follows [Event] at the top of the first deal.
 *  - Multi-line {…} comments are tracked so a tag-like string inside a
 *    comment never triggers a split.
 *  - [Auction] and [Play] data lines (no brackets) are naturally part of the
 *    current deal and never trigger a split.
 *  - Windows \r\n line endings are normalised before processing.
 */
export function splitPBNDeals(raw: string): string[] {
  // Normalise line endings
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const deals: string[] = [];
  const current: string[] = [];

  /**
   * True once the current chunk has seen a [Board], [Deal], or [Auction] tag.
   * Used to distinguish the first deal's header ([Event] / [Site] before any
   * real content) from subsequent deal boundaries.
   */
  let hasContent = false;

  /** True while inside a multi-line {…} comment. */
  let inComment = false;

  // Regex for tags that START a new deal (trigger a split when hasContent).
  const DEAL_START_RE = /^\[(?:Board|Event|Site)\b/i;
  // Regex for tags that SET hasContent (substantive deal data).
  const CONTENT_TAG_RE = /^\[(?:Board|Deal|Auction)\b/i;

  for (const line of lines) {
    const stripped = line.trimStart();

    // Skip BridgeComposer % metadata lines entirely.
    if (!inComment && stripped.startsWith("%")) continue;

    if (!inComment) {
      if (DEAL_START_RE.test(stripped) && hasContent) {
        // Save the finished deal and start a fresh chunk.
        const chunk = current.join("\n").trim();
        if (chunk) deals.push(chunk);
        current.length = 0;
        hasContent = false;
      }
      if (CONTENT_TAG_RE.test(stripped)) {
        hasContent = true;
      }
    }

    current.push(line);

    // Update multi-line comment state character by character.
    for (const ch of line) {
      if (!inComment && ch === "{") inComment = true;
      else if (inComment && ch === "}") inComment = false;
    }
  }

  // Flush the final deal.
  const last = current.join("\n").trim();
  if (last && /\[/.test(last)) deals.push(last);

  return deals;
}

/**
 * Parse a possibly multi-deal PBN string, returning one `ParsedPBN` per
 * successfully parsed deal.  Chunks that fail to parse are silently skipped.
 * A single-deal file returns an array of length 1.
 */
export function parsePBNDeals(raw: string): ParsedPBN[] {
  return splitPBNDeals(raw)
    .map(parsePBN)
    .filter((r): r is { ok: true; data: ParsedPBN } => r.ok)
    .map((r) => r.data);
}
