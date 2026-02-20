"use client";

import { useState, useEffect, useRef } from "react";
import type { PlayHandBlock, HandCards } from "@/types";

// ── Local types ─────────────────────────────────────────────────────────────

type Seat = "N" | "E" | "S" | "W";
type GameSuit = "S" | "H" | "D" | "C";

interface Card {
  suit: GameSuit;
  rank: string;
  id: string;
}

interface TrickPlay {
  seat: Seat;
  card: Card;
}

interface GameSnapshot {
  hands: Record<Seat, Card[]>;
  currentTrick: TrickPlay[];
  lastTrick: TrickPlay[] | null;
  currentSeat: Seat;
  nsTricks: number;
  ewTricks: number;
  trickCount: number;
  gameOver: boolean;
  message: string;
}

interface GameState extends GameSnapshot {
  trumpSuit: GameSuit | null;
  target: number;
  aiPending: boolean;
  undoStack: GameSnapshot[];
  openingLead: { suit: string; rank: string } | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SUIT_ORDER: GameSuit[] = ["S", "H", "D", "C"];

const SUIT_INFO: Record<GameSuit, { symbol: string; color: string }> = {
  S: { symbol: "♠", color: "#1a1a2e" },
  H: { symbol: "♥", color: "#c0392b" },
  D: { symbol: "♦", color: "#c0392b" },
  C: { symbol: "♣", color: "#1a1a2e" },
};

const RANK_VALUES: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

const SEATS: Seat[] = ["N", "E", "S", "W"];
const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

// Maps full seat names and seat codes to codes (handles both formats from our DB)
const TO_SEAT: Record<string, Seat> = {
  North: "N", East: "E", South: "S", West: "W",
  N: "N",    E: "E",    S: "S",    W: "W",
};

// ── Pure helpers ────────────────────────────────────────────────────────────

function parseHand(hand: HandCards): Card[] {
  const cards: Card[] = [];
  for (const suit of SUIT_ORDER) {
    // Strip spaces (editor may use "A K Q" or PBN uses "AKQ"); split into individual rank chars
    const ranks = (hand[suit] || "").replace(/\s/g, "").split("").filter((r) => r && r !== "-");
    for (const rank of ranks) {
      cards.push({ suit, rank, id: `${suit}${rank}` });
    }
  }
  return cards;
}

/** Normalise display-form contracts ("3♠ Dbl") or raw PBN ("3S") → trump suit. */
function getTrumpSuit(contract: string): GameSuit | null {
  const raw = contract
    .replace("♠", "S").replace("♥", "H").replace("♦", "D").replace("♣", "C")
    .replace(/\s*(Dbl|Rdbl|X+).*/i, "").trim();
  const m = raw.match(/\d(NT?|S|H|D|C)$/i);
  if (!m) return null;
  const s = m[1].toUpperCase();
  return (s === "NT" || s === "N") ? null : (s as GameSuit);
}

function getTarget(contract: string): number {
  const m = contract.match(/(\d)/);
  return m ? parseInt(m[1]) + 6 : 7;
}

function getLeader(declarer: Seat): Seat {
  return SEATS[(SEATS.indexOf(declarer) + 1) % 4];
}

function nextSeat(seat: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) + 1) % 4];
}

function isDeclarerSide(seat: Seat): boolean {
  return seat === "N" || seat === "S";
}

function cardValue(card: Card, leadSuit: GameSuit | null, trumpSuit: GameSuit | null): number {
  let v = RANK_VALUES[card.rank] ?? 0;
  if (card.suit === trumpSuit) v += 100;
  else if (card.suit !== leadSuit) v = 0;
  return v;
}

function trickWinner(trick: TrickPlay[], trumpSuit: GameSuit | null): Seat {
  const leadSuit = trick[0].card.suit;
  let best = trick[0];
  let bestVal = cardValue(best.card, leadSuit, trumpSuit);
  for (let i = 1; i < trick.length; i++) {
    const val = cardValue(trick[i].card, leadSuit, trumpSuit);
    if (val > bestVal) { best = trick[i]; bestVal = val; }
  }
  return best.seat;
}

function getLegalCards(hand: Card[], leadSuit: GameSuit | null): Card[] {
  if (!leadSuit) return hand;
  const suited = hand.filter((c) => c.suit === leadSuit);
  return suited.length > 0 ? suited : hand;
}

// ── AI ──────────────────────────────────────────────────────────────────────

function aiSelectCard(hand: Card[], trick: TrickPlay[], trumpSuit: GameSuit | null): Card {
  const leadSuit: GameSuit | null = trick.length > 0 ? trick[0].card.suit : null;
  const legal = getLegalCards(hand, leadSuit);
  if (legal.length <= 1) return legal[0] ?? hand[0];

  const sorted = [...legal].sort((a, b) => (RANK_VALUES[b.rank] ?? 0) - (RANK_VALUES[a.rank] ?? 0));
  const lowest = sorted[sorted.length - 1];
  const trickPos = trick.length;

  let winnerVal = 0;
  let winnerSeat: Seat | null = null;
  if (trick.length > 0) {
    const ls = trick[0].card.suit;
    for (const p of trick) {
      const v = cardValue(p.card, ls, trumpSuit);
      if (v > winnerVal) { winnerVal = v; winnerSeat = p.seat; }
    }
  }

  const isFollowing = leadSuit && legal[0].suit === leadSuit;
  const hasTrump = trumpSuit !== null && legal.some((c) => c.suit === trumpSuit);
  const partnerWinning = winnerSeat && (winnerSeat === "E" || winnerSeat === "W");

  if (trickPos === 0) {
    // Lead from longest non-trump suit, 4th best
    const counts: Partial<Record<GameSuit, number>> = {};
    for (const c of legal) counts[c.suit] = (counts[c.suit] ?? 0) + 1;
    let bestSuit: GameSuit | null = null;
    let bestCount = 0;
    for (const s of SUIT_ORDER) {
      if (s === trumpSuit) continue;
      if ((counts[s] ?? 0) > bestCount) { bestCount = counts[s] ?? 0; bestSuit = s; }
    }
    if (!bestSuit) bestSuit = legal[0].suit;
    const sc = sorted.filter((c) => c.suit === bestSuit);
    return sc.length >= 4 ? sc[3] : sc[sc.length - 1];
  }

  if (trickPos === 1 && isFollowing) {
    const leadRank = RANK_VALUES[trick[0].card.rank] ?? 0;
    if (leadRank >= 10) {
      const cover = sorted.find(
        (c) => (RANK_VALUES[c.rank] ?? 0) > leadRank && (RANK_VALUES[c.rank] ?? 0) >= 10
      );
      if (cover) return cover;
    }
    return lowest;
  }

  if (partnerWinning) return lowest;
  if (isFollowing) {
    const beater = sorted.find((c) => cardValue(c, leadSuit, trumpSuit) > winnerVal);
    return beater ?? lowest;
  }
  if (hasTrump) {
    const trumps = sorted.filter((c) => c.suit === trumpSuit);
    return trumps[trumps.length - 1];
  }
  return lowest;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CardFace({
  card,
  playable,
  onClick,
}: {
  card: Card;
  playable: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={playable ? onClick : undefined}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", width: 30, height: 42, background: "#fff",
        border: playable ? "1.5px solid #c59d5f" : "1.5px solid #ccc",
        borderRadius: 4, margin: "0 -3px", userSelect: "none",
        cursor: playable ? "pointer" : "default", transition: "all 0.15s",
        boxShadow: playable
          ? "0 0 0 1px #c59d5f, 0 2px 8px rgba(197,157,95,0.3)"
          : "0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      <span style={{ color: SUIT_INFO[card.suit].color, fontSize: 13, fontWeight: 700 }}>
        {card.rank === "T" ? "10" : card.rank}
      </span>
      <span style={{ color: SUIT_INFO[card.suit].color, fontSize: 11 }}>
        {SUIT_INFO[card.suit].symbol}
      </span>
    </div>
  );
}

function FaceDownStack({ count, label }: { count: number; label: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      width: 36,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 28, height: 18, marginBottom: -6,
          background: "linear-gradient(135deg, #1a1a2e 25%, #2a2a4e 25%, #2a2a4e 50%, #1a1a2e 50%, #1a1a2e 75%, #2a2a4e 75%)",
          backgroundSize: "6px 6px",
          border: "1px solid #555", borderRadius: 3,
          boxShadow: "0 1px 1px rgba(0,0,0,0.2)",
        }} />
      ))}
      <div style={{
        fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui",
        textTransform: "uppercase", letterSpacing: 0.5,
        marginTop: 14,
      }}>
        {label}
      </div>
    </div>
  );
}

/** Convert stored bid codes to display form for the auction overlay. */
function displayBid(text: string): string {
  if (text === "Pass" || text === "Dbl" || text === "Rdbl") return text;
  return text.replace(/C$/, "♣").replace(/D$/, "♦").replace(/H$/, "♥").replace(/S$/, "♠");
}

// ── Main component ───────────────────────────────────────────────────────────

export default function BridgePlayTable({ deal }: { deal: PlayHandBlock["data"] }) {
  const [, forceRender] = useState(0);
  const [showAuction, setShowAuction] = useState(false);
  const rerender = () => forceRender((n) => n + 1);

  const declarer = (TO_SEAT[deal.declarer] ?? "S") as Seat;

  // Single mutable game state — no stale closures
  const _ref = useRef<GameState>(null!);
  if (!_ref.current) {
    const leader = getLeader(declarer);
    _ref.current = {
      hands: {
        N: parseHand(deal.hands.north),
        E: parseHand(deal.hands.east),
        S: parseHand(deal.hands.south),
        W: parseHand(deal.hands.west),
      },
      currentTrick: [],
      lastTrick:    null,
      currentSeat:  leader,
      nsTricks:     0,
      ewTricks:     0,
      trickCount:   0,
      gameOver:     false,
      message:      `Contract: ${deal.contract}. ${SEAT_NAMES[leader]} leads.`,
      trumpSuit:    getTrumpSuit(deal.contract),
      target:       getTarget(deal.contract),
      aiPending:    false,
      undoStack:    [],
      openingLead:  deal.openingLead ?? null,
    };
  }
  const g = _ref.current;

  function saveSnapshot() {
    g.undoStack.push({
      hands:        { N: [...g.hands.N], E: [...g.hands.E], S: [...g.hands.S], W: [...g.hands.W] },
      currentTrick: [...g.currentTrick],
      lastTrick:    g.lastTrick ? [...g.lastTrick] : null,
      currentSeat:  g.currentSeat,
      nsTricks:     g.nsTricks,
      ewTricks:     g.ewTricks,
      trickCount:   g.trickCount,
      gameOver:     g.gameOver,
      message:      g.message,
    });
  }

  function handleUndo() {
    if (g.undoStack.length === 0 || g.aiPending) return;
    const snap = g.undoStack.pop()!;
    g.hands        = snap.hands;
    g.currentTrick = snap.currentTrick;
    g.lastTrick    = snap.lastTrick;
    g.currentSeat  = snap.currentSeat;
    g.nsTricks     = snap.nsTricks;
    g.ewTricks     = snap.ewTricks;
    g.trickCount   = snap.trickCount;
    g.gameOver     = snap.gameOver;
    g.message      = snap.message;
    rerender();
  }

  function doPlayCard(seat: Seat, card: Card) {
    if (g.gameOver || g.currentSeat !== seat) return;

    g.hands[seat] = g.hands[seat].filter((c) => c.id !== card.id);
    g.currentTrick.push({ seat, card });

    if (g.currentTrick.length === 4) {
      const winner = trickWinner(g.currentTrick, g.trumpSuit);
      if (isDeclarerSide(winner)) g.nsTricks++; else g.ewTricks++;
      g.trickCount++;
      rerender();

      setTimeout(() => {
        g.lastTrick    = [...g.currentTrick];
        g.currentTrick = [];
        if (g.trickCount === 13) {
          g.gameOver = true;
          const diff = g.nsTricks - g.target;
          g.message = g.nsTricks >= g.target
            ? `Contract made! ${deal.contract} ${diff > 0 ? `+${diff}` : "="} (${g.nsTricks} tricks)`
            : `Down ${Math.abs(diff)}. ${deal.contract} needed ${g.target} tricks, got ${g.nsTricks}.`;
        } else {
          g.currentSeat = winner;
          g.message = `${SEAT_NAMES[winner]} wins the trick and leads.`;
        }
        rerender();
        maybeAI();
      }, 800);
    } else {
      g.currentSeat = nextSeat(seat);
      rerender();
      maybeAI();
    }
  }

  function maybeAI() {
    if (g.gameOver || g.aiPending) return;
    if (g.currentSeat !== "E" && g.currentSeat !== "W") return;
    const hand = g.hands[g.currentSeat];
    if (!hand || hand.length === 0) return;

    g.aiPending = true;
    setTimeout(() => {
      g.aiPending = false;
      if (g.gameOver) return;
      const seat = g.currentSeat;
      if (seat !== "E" && seat !== "W") return;
      const h = g.hands[seat];
      if (!h || h.length === 0) return;

      let card: Card | undefined;
      // Use specified opening lead for the very first play
      if (g.currentTrick.length === 0 && g.trickCount === 0 && g.openingLead) {
        const leadId = g.openingLead.suit + g.openingLead.rank;
        card = h.find((c) => c.id === leadId);
      }
      if (!card) card = aiSelectCard(h, g.currentTrick, g.trumpSuit);
      if (card) doPlayCard(seat, card);
    }, 600);
  }

  // Kick off AI if West (or East) leads on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { maybeAI(); }, []);

  function handlePlayCard(card: Card) {
    if (g.gameOver || g.aiPending) return;
    if (g.currentSeat !== "S" && g.currentSeat !== "N") return;
    saveSnapshot();
    doPlayCard(g.currentSeat, card);
  }

  function handleRestart() {
    const leader = getLeader(declarer);
    g.hands        = { N: parseHand(deal.hands.north), E: parseHand(deal.hands.east), S: parseHand(deal.hands.south), W: parseHand(deal.hands.west) };
    g.currentTrick = [];
    g.lastTrick    = null;
    g.currentSeat  = leader;
    g.nsTricks     = 0;
    g.ewTricks     = 0;
    g.trickCount   = 0;
    g.gameOver     = false;
    g.aiPending    = false;
    g.undoStack    = [];
    g.openingLead  = deal.openingLead ?? null;
    g.message      = `Contract: ${deal.contract}. ${SEAT_NAMES[leader]} leads.`;
    rerender();
    setTimeout(() => maybeAI(), 100);
  }

  // ── Derived render state ───────────────────────────────────────────────

  const leadSuit: GameSuit | null = g.currentTrick.length > 0 ? g.currentTrick[0].card.suit : null;
  const legalIdsN = new Set<string>();
  const legalIdsS = new Set<string>();
  if (!g.gameOver) {
    if (g.currentSeat === "N") getLegalCards(g.hands.N, leadSuit).forEach((c) => legalIdsN.add(c.id));
    if (g.currentSeat === "S") getLegalCards(g.hands.S, leadSuit).forEach((c) => legalIdsS.add(c.id));
  }

  const trickToShow = g.currentTrick.length > 0 ? g.currentTrick : (g.lastTrick ?? []);

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderHand(position: Seat, legalIds: Set<string>, label: string | null, isDummy: boolean) {
    const cards = g.hands[position];
    const isActive = g.currentSeat === position && !g.gameOver;
    const bySuit: Record<GameSuit, Card[]> = { S: [], H: [], D: [], C: [] };
    for (const c of cards) bySuit[c.suit].push(c);

    return (
      <div style={{
        padding: 10, borderRadius: 8, width: 480, height: 70, textAlign: "center",
        background: "rgba(255,255,255,0.6)", border: "1px solid #e0ddd5", boxSizing: "border-box",
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
          color: isActive ? "#c59d5f" : "#888", marginBottom: 6, fontFamily: "system-ui",
        }}>
          {label ?? SEAT_NAMES[position]}
          {isDummy && <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none", color: "#999" }}> (Dummy)</span>}
          {isActive && <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none", color: "#c59d5f" }}> ● Your turn</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 10, justifyContent: "center", flexWrap: "nowrap" }}>
          {SUIT_ORDER.map((suit) =>
            bySuit[suit].length > 0 ? (
              <div key={suit} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: SUIT_INFO[suit].color, fontWeight: 700, fontSize: 14, width: 16, flexShrink: 0 }}>
                  {SUIT_INFO[suit].symbol}
                </span>
                <div style={{ display: "flex" }}>
                  {bySuit[suit].map((card) => (
                    <CardFace
                      key={card.id}
                      card={card}
                      playable={legalIds.has(card.id)}
                      onClick={() => handlePlayCard(card)}
                    />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>
    );
  }

  function renderTrick() {
    const positions: Record<Seat, React.CSSProperties> = {
      N: { top: 0,   left: "50%",  transform: "translateX(-50%)" },
      W: { top: "50%", left: 0,    transform: "translateY(-50%)" },
      E: { top: "50%", right: 0,   transform: "translateY(-50%)" },
      S: { bottom: 0, left: "50%", transform: "translateX(-50%)" },
    };
    return (
      <div style={{ width: 180, height: 160, position: "relative" }}>
        {SEATS.map((seat) => {
          const play = trickToShow.find((p) => p.seat === seat);
          if (!play) return null;
          return (
            <div key={seat} style={{ position: "absolute", ...positions[seat] }}>
              <CardFace card={play.card} playable={false} />
            </div>
          );
        })}
      </div>
    );
  }

  // ── Auction overlay data ───────────────────────────────────────────────

  const auctionDealerSeat: Seat =
    deal.auction ? (TO_SEAT[deal.auction.dealer] ?? "N") : "N";
  const dealerIdx = SEATS.indexOf(auctionDealerSeat);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: "'Georgia', serif", background: "#2a1f3d",
      backgroundImage: "radial-gradient(ellipse at center, #3d2d5c 0%, #1a1229 100%)",
      borderRadius: 12, overflow: "hidden", maxWidth: 780, margin: "0 auto",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
      position: "relative",
    }}>

      {/* ── Header ── */}
      <div style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "10px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>

          {/* Contract */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)", fontFamily: "system-ui" }}>
              Contract
            </span>
            <span
              onClick={() => deal.auction && setShowAuction(true)}
              style={{
                fontSize: 22, fontWeight: 700, color: "#fff",
                cursor: deal.auction ? "pointer" : "default",
                borderBottom: deal.auction ? "1px dashed rgba(255,255,255,0.4)" : "none",
              }}
            >
              {deal.contract}
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "system-ui" }}>
              by {SEAT_NAMES[declarer]}
            </span>
            {deal.auction && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui" }}>
                click for auction
              </span>
            )}
          </div>

          {/* Trick counters */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {(["N-S", "E-W"] as const).map((label) => (
              <div key={label} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                background: "rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 14px", minWidth: 44,
              }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontFamily: "system-ui" }}>
                  {label}
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "system-ui" }}>
                  {label === "N-S" ? g.nsTricks : g.ewTricks}
                </span>
              </div>
            ))}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              background: "rgba(197,157,95,0.2)", borderRadius: 6, padding: "4px 14px",
              border: "1px solid rgba(197,157,95,0.3)", marginLeft: 8,
            }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", color: "#c59d5f", fontFamily: "system-ui" }}>Need</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#c59d5f", fontFamily: "system-ui" }}>{g.target}</span>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleUndo}
              disabled={g.undoStack.length === 0 || g.aiPending}
              style={{
                background: g.undoStack.length === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: g.undoStack.length === 0 ? "rgba(255,255,255,0.3)" : "#fff",
                padding: "6px 16px", borderRadius: 6, fontSize: 13,
                cursor: g.undoStack.length === 0 ? "default" : "pointer", fontFamily: "system-ui",
              }}
            >
              ← Undo
            </button>
            <button
              onClick={handleRestart}
              style={{
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff", padding: "6px 16px", borderRadius: 6, fontSize: 13,
                cursor: "pointer", fontFamily: "system-ui",
              }}
            >
              ↻ Restart
            </button>
          </div>
        </div>
      </div>

      {/* ── Message bar ── */}
      <div style={{
        textAlign: "center", padding: "8px 16px", fontSize: 14, fontFamily: "system-ui",
        color: "rgba(255,255,255,0.85)",
        background: g.gameOver
          ? (g.nsTricks >= g.target ? "rgba(39,174,96,0.3)" : "rgba(192,57,43,0.3)")
          : "rgba(0,0,0,0.15)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        {g.message}
      </div>

      {/* ── Table ── */}
      <div style={{
        display: "grid",
        gridTemplateAreas: `". north ." "west center east" ". south ."`,
        gridTemplateColumns: "auto 1fr auto",
        gridTemplateRows: "auto 260px auto",
        gap: 8, padding: 16, alignItems: "center", justifyItems: "center",
      }}>
        <div style={{ gridArea: "north" }}>{renderHand("N", legalIdsN, null, true)}</div>
        <div style={{ gridArea: "west" }}>
          <FaceDownStack count={g.hands.W.length} label="West" />
        </div>
        <div style={{ gridArea: "center" }}>{renderTrick()}</div>
        <div style={{ gridArea: "east" }}>
          <FaceDownStack count={g.hands.E.length} label="East" />
        </div>
        <div style={{ gridArea: "south" }}>{renderHand("S", legalIdsS, "South (You)", false)}</div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", padding: "8px 20px",
        fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui",
        background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span>Vulnerability: {deal.vulnerability}</span>
        <span>Trick {Math.min(g.trickCount + 1, 13)} of 13</span>
      </div>

      {/* ── Auction overlay ── */}
      {showAuction && deal.auction && (
        <div
          onClick={() => setShowAuction(false)}
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 50, cursor: "pointer",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 10, padding: "24px 32px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.4)", cursor: "default", minWidth: 300,
            }}
          >
            <h3 style={{
              margin: "0 0 16px", fontSize: 16, fontWeight: 700,
              color: "#1a1a2e", fontFamily: "system-ui", textAlign: "center",
            }}>
              Auction
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui", fontSize: 15 }}>
              <thead>
                <tr>
                  {[0, 1, 2, 3].map((offset) => {
                    const seat = SEATS[(dealerIdx + offset) % 4];
                    return (
                      <th key={seat} style={{
                        padding: "6px 16px", borderBottom: "2px solid #c59d5f", fontWeight: 700,
                        fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5,
                        color: "#1a1a2e", textAlign: "center",
                      }}>
                        {SEAT_NAMES[seat]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const bids = deal.auction.bids;
                  const rows: (typeof bids[number] | null)[][] = [];
                  for (let i = 0; i < bids.length; i += 4) rows.push(bids.slice(i, i + 4));
                  if (rows.length > 0) {
                    while (rows[rows.length - 1].length < 4) rows[rows.length - 1].push(null);
                  }
                  return rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((bid, ci) => {
                        const bidDisplay = bid ? displayBid(bid.text) : "—";
                        const isRed = bidDisplay.includes("♥") || bidDisplay.includes("♦");
                        return (
                          <td key={ci} style={{
                            padding: "5px 16px", borderBottom: "1px solid #eee",
                            textAlign: "center", color: isRed ? "#c0392b" : "#1a1a2e",
                            fontWeight: bid && bid.text !== "Pass" ? 600 : 400,
                          }}>
                            {bidDisplay}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#999", fontFamily: "system-ui" }}>
              Click anywhere to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
