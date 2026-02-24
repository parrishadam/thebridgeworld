"use client";

import { useState, useRef } from "react";
import type { BiddingTableBlock } from "@/types";
import { parsePBN, parsePBNDeals } from "@/lib/pbn";
import type { ParsedPBN } from "@/lib/pbn";

// ── Constants ─────────────────────────────────────────────────────────────

const DEALER_OFFSET: Record<string, number> = {
  West: 0, North: 1, East: 2, South: 3,
};

// Seat names indexed by position in the W-N-E-S grid column order
const SEATS = ["West", "North", "East", "South"];

// Suit rank for bid-legality comparison: C=0 D=1 H=2 S=3 NT=4
const SUIT_RANK: Record<string, number> = { C: 0, D: 1, H: 2, S: 3, NT: 4 };

const LEVELS = ["1", "2", "3", "4", "5", "6", "7"];
const DENOMINATIONS = [
  { label: "♣", value: "C", red: false },
  { label: "♦", value: "D", red: true  },
  { label: "♥", value: "H", red: true  },
  { label: "♠", value: "S", red: false },
  { label: "NT", value: "NT", red: false },
];

// ── Bid helpers ───────────────────────────────────────────────────────────

/**
 * Numeric rank of a suit/NT bid: 1C=0, 1D=1, … 7NT=34.
 * Higher rank = higher call.
 */
function getBidRank(bidText: string): number {
  const level = parseInt(bidText[0], 10);
  const denom = bidText.slice(1);
  return (level - 1) * 5 + (SUIT_RANK[denom] ?? 0);
}

/** True when the stored bid text is a red-suit call (H or D). */
function isBidRed(text: string): boolean {
  if (text === "Pass" || text === "Dbl" || text === "Rdbl" || text === "?") return false;
  const denom = text.slice(1); // strip the level digit
  return denom === "H" || denom === "D";
}

/** Convert stored codes (1C, 3NT …) to display symbols (1♣, 3NT …). */
function displayBid(text: string): string {
  if (text === "Pass" || text === "Dbl" || text === "Rdbl") return text;
  return text
    .replace(/C$/, "♣")
    .replace(/D$/, "♦")
    .replace(/H$/, "♥")
    .replace(/S$/, "♠");
}

// ── Auction state engine ──────────────────────────────────────────────────

interface AuctionState {
  /** Numeric rank of the last suit/NT bid, −1 if none yet. */
  lastContractBidRank: number;
  /** Stored text of the last suit/NT bid (e.g. "3NT"). */
  lastContractBidText: string;
  /** Team (0=EW, 1=NS) that made the last suit/NT bid, −1 if none. */
  lastContractBidTeam: number;
  doubleState: "none" | "doubled" | "redoubled";
  /** Team that made the most recent Dbl/Rdbl, −1 if none. */
  doublingTeam: number;
  contractBidMade: boolean;
  isOver: boolean;
  /** Display-form final contract, e.g. "3♠ Dbl" or "All Pass". */
  finalContract: string | null;
}

function computeAuctionState(
  bids: Array<{ text: string }>,
  dealer: string,
): AuctionState {
  const dealerOffset = DEALER_OFFSET[dealer] ?? 0;

  let lastContractBidRank = -1;
  let lastContractBidText = "";
  let lastContractBidTeam = -1;
  let doubleState: AuctionState["doubleState"] = "none";
  let doublingTeam = -1;
  let contractBidMade = false;
  let consecutivePasses = 0;

  for (let i = 0; i < bids.length; i++) {
    const text = bids[i].text;
    // Seat index 0-3 (W=0 N=1 E=2 S=3); team: even=EW, odd=NS
    const seatIndex = (dealerOffset + i) % 4;
    const team = seatIndex % 2; // 0=EW, 1=NS

    // "?" ends the auction immediately (bidding problem marker)
    if (text === "?") {
      return {
        lastContractBidRank, lastContractBidText, lastContractBidTeam,
        doubleState, doublingTeam, contractBidMade,
        isOver: true,
        finalContract: "?",
      };
    }

    if (text === "Pass") {
      consecutivePasses++;
    } else {
      consecutivePasses = 0;
      if (text === "Dbl") {
        doubleState = "doubled";
        doublingTeam = team;
      } else if (text === "Rdbl") {
        doubleState = "redoubled";
        doublingTeam = team;
      } else {
        // Suit/NT bid resets doubling
        contractBidMade = true;
        doubleState = "none";
        doublingTeam = -1;
        lastContractBidRank = getBidRank(text);
        lastContractBidText = text;
        lastContractBidTeam = team;
      }
    }

    // Three consecutive passes after any bid → auction over
    if (contractBidMade && consecutivePasses >= 3) {
      const suffix =
        doubleState === "redoubled" ? " Rdbl" :
        doubleState === "doubled"   ? " Dbl"  : "";
      return {
        lastContractBidRank, lastContractBidText, lastContractBidTeam,
        doubleState, doublingTeam, contractBidMade,
        isOver: true,
        finalContract: displayBid(lastContractBidText) + suffix,
      };
    }
    // Four passes with no bid → passed-out board
    if (!contractBidMade && consecutivePasses >= 4) {
      return {
        lastContractBidRank, lastContractBidText, lastContractBidTeam,
        doubleState, doublingTeam, contractBidMade,
        isOver: true,
        finalContract: "All Pass",
      };
    }
  }

  return {
    lastContractBidRank, lastContractBidText, lastContractBidTeam,
    doubleState, doublingTeam, contractBidMade,
    isOver: false,
    finalContract: null,
  };
}

function isLegalCall(
  callText: string,
  state: AuctionState,
  currentTeam: number,
): boolean {
  if (state.isOver) return false;

  if (callText === "Pass") return true;

  if (callText === "Dbl") {
    // Legal only when: there is a standing contract bid, it is not already
    // doubled/redoubled, and the current bidder's side did NOT make it.
    return (
      state.lastContractBidRank >= 0 &&
      state.doubleState === "none" &&
      state.lastContractBidTeam !== -1 &&
      state.lastContractBidTeam !== currentTeam
    );
  }

  if (callText === "Rdbl") {
    // Legal only when the contract is doubled by the opponents.
    return (
      state.doubleState === "doubled" &&
      state.doublingTeam !== -1 &&
      state.doublingTeam !== currentTeam
    );
  }

  // Suit/NT bid: must strictly exceed the current highest bid.
  return getBidRank(callText) > state.lastContractBidRank;
}

// ── Component ─────────────────────────────────────────────────────────────

interface BiddingTableModalProps {
  initial?: BiddingTableBlock["data"];
  onSave: (data: BiddingTableBlock["data"]) => void;
  onClose: () => void;
}

export default function BiddingTableModal({
  initial,
  onSave,
  onClose,
}: BiddingTableModalProps) {
  const [dealer, setDealer]         = useState(initial?.dealer ?? "North");
  const [bids, setBids]             = useState<Array<{ text: string; alert: string | null }>>(
    initial?.bids ?? []
  );
  const [alertInput, setAlertInput] = useState("");
  const [editingAlert, setEditingAlert] = useState<number | null>(null);

  // ── PBN import state ────────────────────────────────────────────────────
  const [showImport,    setShowImport]    = useState(false);
  const [importText,    setImportText]    = useState("");
  const [importError,   setImportError]   = useState<string | null>(null);
  const [pendingDeals,  setPendingDeals]  = useState<ParsedPBN[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Apply a single parsed deal's auction to the form. */
  function applySingleAuction(pbn: ParsedPBN) {
    if (pbn.dealer) setDealer(pbn.dealer);
    setBids(pbn.auction!.bids);
    setEditingAlert(null);
  }

  function applyImport(text: string) {
    setImportError(null);
    const deals = parsePBNDeals(text);

    if (deals.length === 0) {
      const single = parsePBN(text);
      setImportError(!single.ok ? single.error : "No valid deals found in this PBN.");
      return;
    }

    // Keep only deals that have an auction
    const withAuction = deals.filter((d) => d.auction);

    if (withAuction.length === 0) {
      setImportError("No [Auction] section found in this PBN.");
      return;
    }

    setShowImport(false);
    setImportText("");

    if (withAuction.length === 1) {
      applySingleAuction(withAuction[0]);
    } else {
      setPendingDeals(withAuction);
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

  // ── Derived auction state ──────────────────────────────────────────────

  const auctionState    = computeAuctionState(bids, dealer);
  const dealerOffset    = DEALER_OFFSET[dealer] ?? 0;
  const currentSeatIdx  = (dealerOffset + bids.length) % 4;
  const currentTeam     = currentSeatIdx % 2; // 0=EW, 1=NS
  const currentSeatName = SEATS[currentSeatIdx];

  function legal(callText: string): boolean {
    return isLegalCall(callText, auctionState, currentTeam);
  }

  // ── Current contract label (live, before auction ends) ────────────────

  let contractLabel = "No bid yet";
  if (auctionState.lastContractBidText) {
    const dblSuffix =
      auctionState.doubleState === "redoubled" ? " Rdbl" :
      auctionState.doubleState === "doubled"   ? " Dbl"  : "";
    contractLabel = displayBid(auctionState.lastContractBidText) + dblSuffix;
  }

  // ── Bid actions ────────────────────────────────────────────────────────

  function addBid(text: string) {
    if (!isLegalCall(text, auctionState, currentTeam)) return;
    setBids((prev) => [...prev, { text, alert: null }]);
    setEditingAlert(null);
  }

  function removeLastBid() {
    setBids((prev) => prev.slice(0, -1));
    setEditingAlert(null);
  }

  function addQuestionMark() {
    setBids((prev) => [...prev, { text: "?", alert: null }]);
    setEditingAlert(null);
  }

  function setAlert(index: number, value: string) {
    setBids((prev) =>
      prev.map((b, i) => (i === index ? { ...b, alert: value || null } : b))
    );
  }

  // ── Preview grid cells ─────────────────────────────────────────────────

  const offset = dealerOffset;
  const cells: Array<{ text: string; alert: string | null } | null> = [
    ...Array(offset).fill(null),
    ...bids,
  ];
  while (cells.length % 4 !== 0) cells.push(null);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-xl mx-4 my-8 overflow-hidden">

        {/* Header */}
        <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider">
            Bidding Table Block
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

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
                  '[Dealer "N"]\n[Auction "N"]\n1C Pass 1S Pass\n2NT Pass 3NT Pass\nPass Pass'
                }
                rows={5}
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
                  {pendingDeals.length} auctions found — pick one
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
                    pbn.dealer   && `Dealer: ${pbn.dealer}`,
                    pbn.contract && `Contract: ${pbn.contract}`,
                    pbn.auction  && `${pbn.auction.bids.length} bids`,
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
                          applySingleAuction(pbn);
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
            </div>
          )}

          {/* Dealer selector */}
          <div>
            <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Dealer
            </label>
            <select
              value={dealer}
              onChange={(e) => setDealer(e.target.value)}
              className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
            >
              {["North", "East", "South", "West"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Live auction status bar */}
          <div className="bg-stone-50 border border-stone-200 rounded px-3 py-2 flex items-center justify-between text-xs font-sans gap-4">
            <span className="text-stone-500 shrink-0">
              Contract:{" "}
              <span className="font-semibold text-stone-800 font-mono">{contractLabel}</span>
            </span>
            {auctionState.isOver ? (
              <span className="font-semibold text-emerald-700 shrink-0">
                Final: {auctionState.finalContract}
              </span>
            ) : (
              <span className="text-stone-500 shrink-0">
                Next:{" "}
                <span className="font-semibold text-stone-800">{currentSeatName}</span>
              </span>
            )}
          </div>

          {/* Auction-complete banner */}
          {auctionState.isOver && (
            <div className="bg-stone-100 border border-stone-300 rounded px-4 py-3 text-center">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-0.5">
                Auction Complete
              </p>
              <p className="font-mono text-xl font-bold text-stone-900">
                {auctionState.finalContract}
              </p>
              <p className="font-sans text-xs text-stone-400 mt-1">
                Use &ldquo;Remove Last&rdquo; to undo
              </p>
            </div>
          )}

          {/* Bid entry */}
          <div>
            <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Add Bid
            </p>

            {/* Pass / Dbl / Rdbl / ? row */}
            <div className="flex gap-2 mb-3">
              {(["Pass", "Dbl", "Rdbl"] as const).map((call) => {
                const ok = legal(call);
                return (
                  <button
                    key={call}
                    onClick={() => addBid(call)}
                    disabled={!ok}
                    title={!ok ? "Illegal at this point in the auction" : undefined}
                    className={`font-mono text-sm border px-3 py-1.5 rounded transition-colors ${
                      ok
                        ? "border-stone-300 text-stone-700 hover:bg-stone-50"
                        : "border-stone-100 text-stone-300 cursor-not-allowed bg-white"
                    }`}
                  >
                    {call}
                  </button>
                );
              })}
              <button
                onClick={addQuestionMark}
                disabled={auctionState.isOver}
                title="End auction with ? (for bidding problems)"
                className={`font-mono text-sm border px-3 py-1.5 rounded transition-colors ${
                  !auctionState.isOver
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border-stone-100 text-stone-300 cursor-not-allowed bg-white"
                }`}
              >
                ?
              </button>
              <button
                onClick={removeLastBid}
                disabled={bids.length === 0}
                className="ml-auto font-sans text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove Last
              </button>
            </div>

            {/* Level × denomination grid */}
            <div className="overflow-x-auto">
              <table className="font-mono text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="w-8" />
                    {DENOMINATIONS.map((d) => (
                      <th
                        key={d.value}
                        className={`px-2 pb-1 text-center font-sans text-xs font-semibold uppercase tracking-wider ${
                          d.red ? "text-red-500" : "text-stone-600"
                        }`}
                      >
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level) => (
                    <tr key={level}>
                      <td className="font-sans text-xs text-stone-400 pr-2 text-right">
                        {level}
                      </td>
                      {DENOMINATIONS.map((d) => {
                        const bidText = `${level}${d.value}`;
                        const ok = legal(bidText);
                        return (
                          <td key={d.value} className="p-0.5">
                            <button
                              onClick={() => addBid(bidText)}
                              disabled={!ok}
                              title={!ok ? "Illegal bid" : undefined}
                              className={`w-10 py-1 border rounded text-xs transition-colors ${
                                ok
                                  ? `border-stone-200 hover:bg-stone-50 ${
                                      d.red ? "text-red-600" : "text-stone-800"
                                    }`
                                  : "border-stone-100 text-stone-200 bg-stone-50 cursor-not-allowed"
                              }`}
                            >
                              {level}{d.label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alert editing */}
          {bids.length > 0 && (
            <div>
              <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-2">
                Add Alert (click a bid below)
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {bids.map((bid, i) => {
                  const red = isBidRed(bid.text);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setEditingAlert(editingAlert === i ? null : i);
                        setAlertInput(bid.alert ?? "");
                      }}
                      className={`font-mono text-xs border px-2 py-1 rounded transition-colors ${
                        red ? "text-red-600" : "text-stone-700"
                      } ${
                        bid.alert
                          ? "border-blue-300 bg-blue-50"
                          : "border-stone-200 hover:bg-stone-50"
                      } ${editingAlert === i ? "ring-2 ring-blue-400" : ""}`}
                    >
                      {displayBid(bid.text)}
                      {bid.alert && <sup className="text-blue-600 ml-0.5">*</sup>}
                    </button>
                  );
                })}
              </div>
              {editingAlert !== null && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={alertInput}
                    onChange={(e) => setAlertInput(e.target.value)}
                    placeholder="Alert explanation…"
                    className="flex-1 border border-stone-200 rounded px-3 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
                  />
                  <button
                    onClick={() => {
                      setAlert(editingAlert, alertInput);
                      setEditingAlert(null);
                      setAlertInput("");
                    }}
                    className="font-sans text-sm bg-stone-800 text-white px-3 py-1.5 rounded hover:bg-stone-700 transition-colors"
                  >
                    Set
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          {bids.length > 0 && (
            <div>
              <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-2">
                Preview
              </p>
              <div className="border border-stone-200 rounded bg-stone-50 p-4">
                <div className="grid grid-cols-4 gap-1 max-w-xs font-mono text-sm">
                  {["W", "N", "E", "S"].map((s) => (
                    <div
                      key={s}
                      className="text-center text-xs font-sans font-semibold text-stone-400 pb-1 border-b border-stone-200 mb-1"
                    >
                      {s}
                    </div>
                  ))}
                  {cells.map((cell, i) => {
                    if (!cell) return <div key={i} className="py-0.5" />;
                    const red = isBidRed(cell.text);
                    return (
                      <div
                        key={i}
                        className={`text-center py-0.5 text-xs ${
                          red ? "text-red-600" : "text-stone-800"
                        }`}
                      >
                        {displayBid(cell.text)}
                        {cell.alert && (
                          <sup className="text-blue-600 ml-0.5">*</sup>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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
            onClick={() => onSave({ dealer, bids })}
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
