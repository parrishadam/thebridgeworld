import type { ContentBlock, BridgeHandBlock, BiddingTableBlock, Direction, HandCards } from "@/types";

// ── Hand validation ─────────────────────────────────────────────────────────

/** Count the total cards in a hand (e.g. "AKT63" → 5 cards). */
function countCards(holding: string): number {
  if (!holding || holding === "—" || holding === "-") return 0;
  // Handle both legacy "10" format and new "T" format
  return holding.replace(/10/g, "T").length;
}

/** Returns the total card count for a HandCards object. */
export function handCardCount(hand: HandCards): number {
  return (
    countCards(hand.S) +
    countCards(hand.H) +
    countCards(hand.D) +
    countCards(hand.C)
  );
}

export interface HandValidationError {
  direction: Direction;
  count: number;
  expected: number;
}

/**
 * Validate a BridgeHandBlock.
 * Instead of requiring exactly 13 cards, compute the card count of all
 * visible hands and check they all match each other.
 * Error only when visible hands have DIFFERENT counts.
 */
export function validateHandBlock(
  block: BridgeHandBlock,
): HandValidationError[] {
  const directions: Direction[] = ["north", "south", "east", "west"];
  const visibleCounts: { dir: Direction; count: number }[] = [];

  for (const dir of directions) {
    if (!block.data.visibleHands[dir]) continue;
    visibleCounts.push({ dir, count: handCardCount(block.data.hands[dir]) });
  }

  if (visibleCounts.length === 0) return [];

  // Find the mode (most common count) among visible hands.
  // On tie, prefer 13 (standard full-hand count).
  const expectedCount = modeCardCount(visibleCounts.map((v) => v.count));

  const errors: HandValidationError[] = [];
  for (const { dir, count } of visibleCounts) {
    if (count !== expectedCount) {
      errors.push({ direction: dir, count, expected: expectedCount });
    }
  }
  return errors;
}

/**
 * Determine the expected card count from a list of counts.
 * Returns the mode (most frequent count). On tie, prefer 13.
 */
function modeCardCount(counts: number[]): number {
  const freq = new Map<number, number>();
  for (const c of counts) {
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  let best = counts[0];
  let bestFreq = 0;
  for (const entry of Array.from(freq.entries())) {
    const [count, f] = [entry[0], entry[1]];
    if (f > bestFreq || (f === bestFreq && count === 13)) {
      bestFreq = f;
      best = count;
    }
  }
  return best;
}

// ── Auto-fix for hands with too many cards ──────────────────────────────────

const SUIT_KEYS: (keyof HandCards)[] = ["S", "H", "D", "C"];
const HONOR_CARDS = new Set(["A", "K", "Q", "J"]);

/**
 * Try to fix a hand that has more cards than expected by removing a spurious "2".
 * Returns the fixed HandCards if successful, or null if no fix found.
 * Strategy: try removing a "2" from each suit (longest suit first),
 * and accept the first fix that yields the expected card count.
 */
function tryFixHandExtra(hand: HandCards, expectedCount: number): HandCards | null {
  // Sort suits by length descending — spurious "2" is more likely in longer suits
  const ranked = [...SUIT_KEYS].sort(
    (a, b) => countCards(hand[b]) - countCards(hand[a]),
  );

  for (const suit of ranked) {
    const holding = hand[suit];
    if (!holding.includes("2")) continue;

    // Remove the first "2"
    const fixed = holding.replace("2", "");
    const candidate = { ...hand, [suit]: fixed };
    if (handCardCount(candidate) === expectedCount) {
      return candidate;
    }
  }
  return null;
}

/**
 * Check if a hand has impossible holdings (duplicate honor cards in same suit).
 * Returns list of problematic suits.
 */
function findDuplicateHonors(hand: HandCards): string[] {
  const problems: string[] = [];
  for (const suit of SUIT_KEYS) {
    const holding = (hand[suit] || "").replace(/10/g, "T");
    const seen = new Set<string>();
    for (const card of holding) {
      if (HONOR_CARDS.has(card)) {
        if (seen.has(card)) {
          problems.push(suit);
          break;
        }
        seen.add(card);
      }
    }
  }
  return problems;
}

export interface AutoFixResult {
  blockId: string;
  direction: Direction;
  suit: string;
  before: string;
  after: string;
}

export interface ManualReviewFlag {
  blockId: string;
  direction: Direction;
  reason: string;
}

/**
 * Attempt to auto-fix all BridgeHandBlocks in an article.
 * Returns the (possibly modified) blocks array, a list of fixes applied,
 * and a list of manual review flags for issues that can't be auto-fixed.
 */
export function autoFixContentBlocks(
  blocks: ContentBlock[],
): { blocks: ContentBlock[]; fixes: AutoFixResult[]; manualReviewFlags: ManualReviewFlag[] } {
  const fixes: AutoFixResult[] = [];
  const manualReviewFlags: ManualReviewFlag[] = [];

  const fixed = blocks.map((block) => {
    if (block.type !== "bridgeHand") return block;

    const directions: Direction[] = ["north", "south", "east", "west"];

    // Compute expected count (mode of visible hand counts, prefer 13 on tie)
    const visibleCounts: number[] = [];
    for (const dir of directions) {
      if (!block.data.visibleHands[dir]) continue;
      visibleCounts.push(handCardCount(block.data.hands[dir]));
    }
    if (visibleCounts.length === 0) return block;

    const expectedCount = modeCardCount(visibleCounts);

    let handsChanged = false;
    const newHands = { ...block.data.hands };

    for (const dir of directions) {
      if (!block.data.visibleHands[dir]) continue;
      const count = handCardCount(newHands[dir]);

      if (count <= expectedCount) continue; // Only fix hands with MORE cards than expected

      // Check for duplicate honors — flag for manual review
      const dupHonors = findDuplicateHonors(newHands[dir]);
      if (dupHonors.length > 0) {
        manualReviewFlags.push({
          blockId: block.id,
          direction: dir,
          reason: `Duplicate honor cards in suit(s): ${dupHonors.join(", ")}`,
        });
        continue;
      }

      // Only auto-fix single-extra-card cases (count === expectedCount + 1)
      if (count === expectedCount + 1) {
        const fixedHand = tryFixHandExtra(newHands[dir], expectedCount);
        if (fixedHand) {
          // Guard: verify fix didn't drop below target
          const fixedCount = handCardCount(fixedHand);
          if (fixedCount < expectedCount) {
            // Revert — the fix would make the hand too short
            manualReviewFlags.push({
              blockId: block.id,
              direction: dir,
              reason: `Auto-fix reverted: would reduce ${dir} from ${count} to ${fixedCount} cards (target ${expectedCount})`,
            });
          } else {
            for (const suit of SUIT_KEYS) {
              if (fixedHand[suit] !== newHands[dir][suit]) {
                fixes.push({
                  blockId: block.id,
                  direction: dir,
                  suit,
                  before: newHands[dir][suit],
                  after: fixedHand[suit],
                });
              }
            }
            newHands[dir] = fixedHand;
            handsChanged = true;
          }
        }
      } else {
        // More than 1 extra card — flag for manual review
        manualReviewFlags.push({
          blockId: block.id,
          direction: dir,
          reason: `Hand has ${count} cards, expected ${expectedCount}`,
        });
      }
    }

    if (!handsChanged) return block;
    return {
      ...block,
      data: { ...block.data, hands: newHands },
    } as BridgeHandBlock;
  });

  return { blocks: fixed, fixes, manualReviewFlags };
}

// ── Auction auto-fix ────────────────────────────────────────────────────────

export interface AuctionFixResult {
  blockId: string;
  description: string;
}

/**
 * Auto-fix incomplete auctions in BiddingTableBlocks.
 * If an auction ends with exactly 2 passes after the last non-pass bid
 * and doesn't end in "?", append a third Pass.
 */
export function autoFixAuctions(
  blocks: ContentBlock[],
): { blocks: ContentBlock[]; fixes: AuctionFixResult[] } {
  const fixes: AuctionFixResult[] = [];

  const fixed = blocks.map((block) => {
    if (block.type !== "biddingTable") return block;

    const bids = block.data.bids;
    if (bids.length < 2) return block;

    // If last bid is "?", skip — it's a bidding problem
    if (bids[bids.length - 1].text === "?") return block;

    // Check if it ends with exactly 2 passes (not 3)
    const last3 = bids.slice(-3).map((b) => b.text);
    const last2 = bids.slice(-2).map((b) => b.text);

    if (last2.every((t) => t === "Pass") && !(last3.length === 3 && last3.every((t) => t === "Pass"))) {
      // Ends with exactly 2 passes — append a third
      const newBids = [...bids, { text: "Pass", alert: null }];
      fixes.push({
        blockId: block.id,
        description: `Appended 3rd Pass to auction (had ${bids.length} bids ending in 2 passes)`,
      });
      return {
        ...block,
        data: { ...block.data, bids: newBids },
      } as BiddingTableBlock;
    }

    return block;
  });

  return { blocks: fixed, fixes };
}

// ── Bid validation ──────────────────────────────────────────────────────────

const VALID_BID_PATTERN =
  /^(Pass|Dbl|Rdbl|[1-7](C|D|H|S|NT)|—|\?)$/;

export function isValidBid(text: string): boolean {
  return VALID_BID_PATTERN.test(text);
}

// ── Full article validation ─────────────────────────────────────────────────

export interface BlockError {
  blockIndex: number;
  blockId: string;
  blockType: string;
  errors: string[];
}

/** Validate all content blocks in an article, returning per-block errors. */
export function validateContentBlocks(blocks: ContentBlock[]): BlockError[] {
  const result: BlockError[] = [];

  blocks.forEach((block, index) => {
    const errors: string[] = [];

    if (block.type === "bridgeHand") {
      const handErrors = validateHandBlock(block);
      for (const e of handErrors) {
        errors.push(
          `${e.direction} has ${e.count} cards (expected ${e.expected})`,
        );
      }
    }

    if (block.type === "biddingTable") {
      const bids = block.data.bids;
      const invalidBids = bids
        .filter((b) => !isValidBid(b.text))
        .map((b) => b.text);
      if (invalidBids.length > 0) {
        errors.push(`Invalid bids: ${invalidBids.join(", ")}`);
      }

      // Auction must end with 3 consecutive passes — unless it ends with "?"
      if (bids.length >= 4) {
        const lastBid = bids[bids.length - 1].text;
        if (lastBid !== "?") {
          const last3 = bids.slice(-3).map((b) => b.text);
          if (!last3.every((t) => t === "Pass")) {
            errors.push(
              `Auction must end with 3 consecutive passes (got: ${last3.join(", ")})`,
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      result.push({
        blockIndex: index,
        blockId: block.id,
        blockType: block.type,
        errors,
      });
    }
  });

  return result;
}

/** Quick check: does the article have any hand-count errors? */
export function hasHandErrors(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (b) => b.type === "bridgeHand" && validateHandBlock(b).length > 0,
  );
}
