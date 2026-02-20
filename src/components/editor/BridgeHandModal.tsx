"use client";

import { useState, useRef } from "react";
import type { BridgeHandBlock, PlayHandBlock, BiddingTableBlock, Direction, HandCards } from "@/types";
import { parsePBN, parsePBNDeals } from "@/lib/pbn";
import type { ParsedPBN } from "@/lib/pbn";

// ── Lead parsing helpers ─────────────────────────────────────────────────

const LEAD_SUIT_SYMBOLS: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const LEAD_SYMBOL_TO_SUIT: Record<string, string> = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
const LEAD_RANK_CHARS  = new Set(["A","K","Q","J","T","2","3","4","5","6","7","8","9"]);
const LEAD_SUIT_LETTERS = new Set(["S","H","D","C"]);

/**
 * Parse any lead input format to { suit, rank } or null.
 * Accepts: "♥J", "J♥", "HJ", "JH", "hj", "jh" (case-insensitive).
 */
function parseLeadInput(raw: string): { suit: string; rank: string } | null {
  if (!raw) return null;
  const s = raw.trim();

  // Symbol-first: "♥J"
  for (const [sym, suit] of Object.entries(LEAD_SYMBOL_TO_SUIT)) {
    if (s.startsWith(sym)) {
      const rank = s.slice(sym.length).trim().toUpperCase();
      if (LEAD_RANK_CHARS.has(rank)) return { suit, rank };
    }
  }
  // Symbol-last: "J♥"
  for (const [sym, suit] of Object.entries(LEAD_SYMBOL_TO_SUIT)) {
    if (s.endsWith(sym)) {
      const rank = s.slice(0, s.length - sym.length).trim().toUpperCase();
      if (LEAD_RANK_CHARS.has(rank)) return { suit, rank };
    }
  }
  // Two-letter: "HJ" (suit+rank) or "JH" (rank+suit), case-insensitive
  const u = s.toUpperCase();
  if (u.length === 2) {
    const [c0, c1] = [u[0], u[1]];
    if (LEAD_SUIT_LETTERS.has(c0) && LEAD_RANK_CHARS.has(c1)) return { suit: c0, rank: c1 };
    if (LEAD_RANK_CHARS.has(c0) && LEAD_SUIT_LETTERS.has(c1)) return { suit: c1, rank: c0 };
  }
  return null;
}

/** Format a parsed lead to display form: "♥J". */
function formatLead(lead: { suit: string; rank: string }): string {
  return (LEAD_SUIT_SYMBOLS[lead.suit] ?? lead.suit) + lead.rank;
}

interface BridgeHandModalProps {
  /** "bridgeHand" (default) shows a static hand block; "playHand" adds a Declarer field. */
  mode?: "bridgeHand" | "playHand";
  initial?: BridgeHandBlock["data"] | PlayHandBlock["data"];
  /**
   * Called when the user saves a single hand.
   * In bridgeHand mode, auctionData is provided when a PBN auction was imported
   * so the parent can insert a companion Bidding Table block.
   * In playHand mode, the auction is embedded in the block data; auctionData is unused.
   */
  onSave: (data: BridgeHandBlock["data"] | PlayHandBlock["data"], auctionData?: BiddingTableBlock["data"]) => void;
  /**
   * Called when the user clicks "Import All" on a multi-deal PBN.
   * When undefined the "Import All" button is hidden (e.g. when editing an existing block).
   */
  onSaveAll?: (deals: Array<{ handData: BridgeHandBlock["data"] | PlayHandBlock["data"]; auctionData?: BiddingTableBlock["data"]; commentary?: string }>) => void;
  onClose: () => void;
}

const DIRECTIONS: Direction[] = ["north", "south", "east", "west"];
const DIR_LABEL: Record<Direction, string> = {
  north: "North", south: "South", east: "East", west: "West",
};

const DEFAULT_HAND: HandCards = { S: "", H: "", D: "", C: "" };

const SUIT_LABELS = [
  { key: "S" as const, symbol: "♠", color: "text-stone-900" },
  { key: "H" as const, symbol: "♥", color: "text-red-600" },
  { key: "D" as const, symbol: "♦", color: "text-red-600" },
  { key: "C" as const, symbol: "♣", color: "text-stone-900" },
];

function defaultData(): BridgeHandBlock["data"] {
  const hands = {} as Record<Direction, HandCards>;
  const visibleHands = {} as Record<Direction, boolean>;
  for (const d of DIRECTIONS) {
    hands[d]        = { ...DEFAULT_HAND };
    visibleHands[d] = true;
  }
  return {
    title:         "",
    dealer:        "North",
    vulnerability: "None",
    contract:      "",
    lead:          "",
    hands,
    visibleHands,
  };
}

export default function BridgeHandModal({
  mode = "bridgeHand",
  initial,
  onSave,
  onSaveAll,
  onClose,
}: BridgeHandModalProps) {
  const [data, setData] = useState<BridgeHandBlock["data"]>(
    (initial as BridgeHandBlock["data"]) ?? defaultData()
  );

  // Extra state for playHand mode
  const [declarer, setDeclarer] = useState<string>(
    (initial as PlayHandBlock["data"] | undefined)?.declarer ?? "S"
  );

  // ── PBN import state ────────────────────────────────────────────────────
  const [showImport,    setShowImport]    = useState(false);
  const [importText,    setImportText]    = useState("");
  const [importError,   setImportError]   = useState<string | null>(null);
  /**
   * In bridgeHand mode: auction parsed from PBN, offered as an optional companion block.
   * In playHand mode: auction is embedded in the block; initialise from existing data when editing.
   */
  const [pendingAuction, setPendingAuction] =
    useState<BiddingTableBlock["data"] | null>(
      mode === "playHand"
        ? ((initial as PlayHandBlock["data"] | undefined)?.auction ?? null)
        : null,
    );
  const [includeAuction, setIncludeAuction] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Non-null when a multi-deal PBN was imported and user hasn't picked yet. */
  const [pendingDeals, setPendingDeals] = useState<ParsedPBN[] | null>(null);

  // ── Field helpers ────────────────────────────────────────────────────────

  function setField<K extends keyof BridgeHandBlock["data"]>(
    key: K,
    value: BridgeHandBlock["data"][K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function setHandCard(dir: Direction, suit: keyof HandCards, value: string) {
    setData((prev) => ({
      ...prev,
      hands: {
        ...prev.hands,
        [dir]: { ...prev.hands[dir], [suit]: value.toUpperCase() },
      },
    }));
  }

  function toggleVisible(dir: Direction) {
    setData((prev) => ({
      ...prev,
      visibleHands: {
        ...prev.visibleHands,
        [dir]: !prev.visibleHands[dir],
      },
    }));
  }

  // ── PBN import handlers ──────────────────────────────────────────────────

  /** Apply a single parsed deal to the form fields. */
  function applySingleDeal(pbn: ParsedPBN) {
    setData((prev) => {
      const next = { ...prev };
      if (pbn.dealer)        next.dealer        = pbn.dealer;
      if (pbn.vulnerability) next.vulnerability = pbn.vulnerability;
      if (pbn.contract)      next.contract      = pbn.contract;
      // Populate lead from [Play] section (already in display form "♥J")
      if (pbn.lead)          next.lead          = pbn.lead;
      if (pbn.deal) {
        next.hands = {
          north: { ...DEFAULT_HAND, ...pbn.deal.north },
          south: { ...DEFAULT_HAND, ...pbn.deal.south },
          east:  { ...DEFAULT_HAND, ...pbn.deal.east  },
          west:  { ...DEFAULT_HAND, ...pbn.deal.west  },
        };
        next.visibleHands = { north: true, south: true, east: true, west: true };
      }
      return next;
    });
    if (pbn.declarer) setDeclarer(pbn.declarer);
    if (pbn.auction) {
      setPendingAuction({ dealer: pbn.auction.dealer, bids: pbn.auction.bids });
      setIncludeAuction(true);
    } else {
      setPendingAuction(null);
    }
  }

  /** Convert a ParsedPBN to the { handData, auctionData, commentary } shape for onSaveAll. */
  function pbnToExport(pbn: ParsedPBN): {
    handData: BridgeHandBlock["data"] | PlayHandBlock["data"];
    auctionData?: BiddingTableBlock["data"];
    commentary?: string;
  } {
    const base = defaultData();
    if (pbn.dealer)        base.dealer        = pbn.dealer;
    if (pbn.vulnerability) base.vulnerability = pbn.vulnerability;
    if (pbn.contract)      base.contract      = pbn.contract;
    if (pbn.deal) {
      base.hands = {
        north: { ...DEFAULT_HAND, ...pbn.deal.north },
        south: { ...DEFAULT_HAND, ...pbn.deal.south },
        east:  { ...DEFAULT_HAND, ...pbn.deal.east  },
        west:  { ...DEFAULT_HAND, ...pbn.deal.west  },
      };
      base.visibleHands = { north: true, south: true, east: true, west: true };
    }

    if (mode === "playHand") {
      // Embed auction and lead into the block; no separate biddingTable block
      const handData: PlayHandBlock["data"] = {
        ...base,
        declarer:    pbn.declarer ?? "S",
        lead:        pbn.lead,
        openingLead: pbn.openingLead,
        auction: pbn.auction
          ? { dealer: pbn.auction.dealer, bids: pbn.auction.bids }
          : undefined,
      };
      return { handData, commentary: pbn.commentary };
    }

    // bridgeHand mode: auction goes in a companion BiddingTable block
    const auctionData = pbn.auction
      ? { dealer: pbn.auction.dealer, bids: pbn.auction.bids }
      : undefined;
    return { handData: base, auctionData, commentary: pbn.commentary };
  }

  function applyImport(text: string) {
    setImportError(null);
    const deals = parsePBNDeals(text);

    if (deals.length === 0) {
      // Fall back to single-deal parser to surface a meaningful error message
      const single = parsePBN(text);
      setImportError(!single.ok ? single.error : "No valid deals found in this PBN.");
      return;
    }

    setShowImport(false);
    setImportText("");

    if (deals.length === 1) {
      applySingleDeal(deals[0]);
    } else {
      setPendingDeals(deals);
    }
  }

  function handleImport() {
    applyImport(importText);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => applyImport((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-2xl mx-4 my-8 overflow-hidden">

        {/* Header */}
        <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider">
            {mode === "playHand" ? "Play Hand Block" : "Bridge Hand Block"}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">

          {/* ── PBN import panel ── */}
          {!showImport ? (
            <button
              onClick={() => { setShowImport(true); setImportError(null); }}
              className="w-full text-left text-xs font-sans text-stone-400 hover:text-stone-700 border border-dashed border-stone-200 hover:border-stone-400 rounded px-3 py-2 transition-colors"
            >
              ↓ Import from PBN
            </button>
          ) : (
            <div className="border border-stone-300 rounded bg-stone-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500">
                  Import from PBN
                </p>
                <button
                  onClick={() => { setShowImport(false); setImportError(null); }}
                  className="text-xs font-sans text-stone-400 hover:text-stone-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  '[Dealer "N"]\n[Vulnerable "NS"]\n[Deal "N:AK76.QJ5.K83.AT4 T84.K7.AQ32.AT92 Q532.AT96.75.J76 J9.8432.T96.KQ85"]\n[Contract "3NT"]\n[Auction "N"]\n1C Pass 1S Pass\n2NT Pass 3NT Pass\nPass Pass'
                }
                rows={7}
                spellCheck={false}
                className="w-full font-mono text-xs border border-stone-200 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-stone-400 bg-white"
              />
              {importError && (
                <p className="text-xs font-sans text-red-600">{importError}</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pbn,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="font-sans text-xs border border-stone-300 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors"
                >
                  Choose .pbn file
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="font-sans text-xs bg-stone-800 text-white px-4 py-1.5 rounded hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import
                </button>
              </div>
            </div>
          )}

          {/* ── Multi-deal selector (shows after importing a multi-deal PBN) ── */}
          {pendingDeals && (
            <div className="border border-stone-300 rounded bg-stone-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500">
                  {pendingDeals.length} deals found — pick one
                </p>
                <button
                  onClick={() => setPendingDeals(null)}
                  className="text-xs font-sans text-stone-400 hover:text-stone-700 transition-colors"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-1.5">
                {pendingDeals.map((pbn, i) => {
                  const label = pbn.board ? `Board ${pbn.board}` : `Deal ${i + 1}`;
                  const meta = [
                    pbn.dealer        && `Dealer: ${pbn.dealer}`,
                    pbn.vulnerability && `Vul: ${pbn.vulnerability}`,
                    pbn.contract      && `Contract: ${pbn.contract}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-white border border-stone-200 rounded px-3 py-2 gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-sans text-sm font-semibold text-stone-800 truncate">
                          {label}
                        </p>
                        {meta && (
                          <p className="font-sans text-xs text-stone-400 truncate">{meta}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          applySingleDeal(pbn);
                          setPendingDeals(null);
                        }}
                        className="font-sans text-xs border border-stone-300 text-stone-700 px-3 py-1 rounded hover:bg-stone-50 transition-colors shrink-0"
                      >
                        Use this
                      </button>
                    </div>
                  );
                })}
              </div>
              {onSaveAll && (
                <button
                  onClick={() => {
                    onSaveAll(pendingDeals.map(pbnToExport));
                    setPendingDeals(null);
                  }}
                  className="w-full font-sans text-xs bg-stone-800 text-white px-4 py-2 rounded hover:bg-stone-700 transition-colors"
                >
                  Import All ({pendingDeals.length} hands)
                </button>
              )}
            </div>
          )}

          {/* Auction-import offer (shows after a successful PBN import with auction) */}
          {pendingAuction && mode === "bridgeHand" && (
            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2.5 flex items-center gap-3">
              <input
                id="include-auction"
                type="checkbox"
                checked={includeAuction}
                onChange={(e) => setIncludeAuction(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="include-auction" className="text-xs font-sans text-blue-800 cursor-pointer leading-snug">
                Also insert a <strong>Bidding Table</strong> block with the imported auction
                ({pendingAuction.bids.length} calls, dealer: {pendingAuction.dealer})
              </label>
            </div>
          )}
          {pendingAuction && mode === "playHand" && (
            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2.5 flex items-center justify-between gap-3">
              <p className="text-xs font-sans text-blue-800 leading-snug">
                Auction loaded: <strong>{pendingAuction.bids.length} calls</strong>, dealer: {pendingAuction.dealer} — will be embedded in block.
              </p>
              <button
                onClick={() => setPendingAuction(null)}
                className="text-xs font-sans text-blue-500 hover:text-blue-800 transition-colors shrink-0"
              >
                Remove
              </button>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Title
            </label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Bridge Hand"
              className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
          </div>

          {/* Dealer / Vulnerability */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Dealer
              </label>
              <select
                value={data.dealer}
                onChange={(e) => setField("dealer", e.target.value)}
                className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                {["North", "South", "East", "West"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Vulnerability
              </label>
              <select
                value={data.vulnerability}
                onChange={(e) => setField("vulnerability", e.target.value)}
                className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                {["None", "N-S", "E-W", "All"].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contract / Declarer (playHand only) / Lead */}
          <div className={`grid gap-4 ${mode === "playHand" ? "grid-cols-3" : "grid-cols-2"}`}>
            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Contract
              </label>
              <input
                type="text"
                value={data.contract}
                onChange={(e) => setField("contract", e.target.value)}
                placeholder="e.g. 4♠"
                className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>
            {mode === "playHand" && (
              <div>
                <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
                  Declarer
                </label>
                <select
                  value={declarer}
                  onChange={(e) => setDeclarer(e.target.value)}
                  className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
                >
                  {["N", "E", "S", "W"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Lead
              </label>
              <input
                type="text"
                value={data.lead}
                onChange={(e) => setField("lead", e.target.value)}
                onBlur={(e) => {
                  const parsed = parseLeadInput(e.target.value);
                  if (parsed) setField("lead", formatLead(parsed));
                }}
                placeholder="e.g. ♥K or HK or KH"
                className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>
          </div>

          {/* Hands */}
          <div>
            <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Hands
            </p>
            <div className="grid grid-cols-2 gap-4">
              {DIRECTIONS.map((dir) => (
                <div key={dir} className="border border-stone-200 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-sans text-sm font-semibold text-stone-700">
                      {DIR_LABEL[dir]}
                    </p>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.visibleHands[dir]}
                        onChange={() => toggleVisible(dir)}
                        className="rounded"
                      />
                      <span className="text-xs font-sans text-stone-500">Visible</span>
                    </label>
                  </div>
                  {SUIT_LABELS.map(({ key, symbol, color }) => (
                    <div key={key} className="flex items-center gap-2 mb-1">
                      <span className={`${color} font-mono text-sm w-4 text-center`}>
                        {symbol}
                      </span>
                      <input
                        type="text"
                        value={data.hands[dir][key]}
                        onChange={(e) => setHandCard(dir, key, e.target.value)}
                        placeholder="—"
                        className="flex-1 border border-stone-200 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-300"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Compass preview */}
          <div>
            <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Preview
            </p>
            <div className="bg-stone-50 border border-stone-200 rounded p-4">
              <div className="grid grid-cols-3 max-w-xs mx-auto gap-2 text-xs">
                <div />
                <div className="border border-stone-200 bg-white rounded p-2 text-center">
                  <p className="font-sans font-semibold text-stone-400 mb-1">N</p>
                  {data.visibleHands.north
                    ? SUIT_LABELS.map(({ key, symbol, color }) => (
                        <div key={key} className={`${color} font-mono`}>
                          {symbol} {data.hands.north[key] || "—"}
                        </div>
                      ))
                    : <span className="text-stone-300 italic">Hidden</span>
                  }
                </div>
                <div />
                <div className="border border-stone-200 bg-white rounded p-2 text-center">
                  <p className="font-sans font-semibold text-stone-400 mb-1">W</p>
                  {data.visibleHands.west
                    ? SUIT_LABELS.map(({ key, symbol, color }) => (
                        <div key={key} className={`${color} font-mono`}>
                          {symbol} {data.hands.west[key] || "—"}
                        </div>
                      ))
                    : <span className="text-stone-300 italic">Hidden</span>
                  }
                </div>
                <div className="flex items-center justify-center">
                  <div className="w-8 h-8 border border-stone-300 rounded-full flex items-center justify-center text-stone-300 text-sm">
                    ✦
                  </div>
                </div>
                <div className="border border-stone-200 bg-white rounded p-2 text-center">
                  <p className="font-sans font-semibold text-stone-400 mb-1">E</p>
                  {data.visibleHands.east
                    ? SUIT_LABELS.map(({ key, symbol, color }) => (
                        <div key={key} className={`${color} font-mono`}>
                          {symbol} {data.hands.east[key] || "—"}
                        </div>
                      ))
                    : <span className="text-stone-300 italic">Hidden</span>
                  }
                </div>
                <div />
                <div className="border border-stone-200 bg-white rounded p-2 text-center">
                  <p className="font-sans font-semibold text-stone-400 mb-1">S</p>
                  {data.visibleHands.south
                    ? SUIT_LABELS.map(({ key, symbol, color }) => (
                        <div key={key} className={`${color} font-mono`}>
                          {symbol} {data.hands.south[key] || "—"}
                        </div>
                      ))
                    : <span className="text-stone-300 italic">Hidden</span>
                  }
                </div>
                <div />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="font-sans text-sm text-stone-600 border border-stone-200 px-4 py-2 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (mode === "playHand") {
                const parsedLead = data.lead ? parseLeadInput(data.lead) : null;
                onSave({
                  ...data,
                  declarer,
                  auction: pendingAuction ?? undefined,
                  lead: parsedLead ? formatLead(parsedLead) : data.lead,
                  openingLead: parsedLead ?? undefined,
                });
              } else {
                onSave(
                  data,
                  includeAuction && pendingAuction ? pendingAuction : undefined,
                );
              }
            }}
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
