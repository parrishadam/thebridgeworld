"use client";

import { useState } from "react";
import type { ContentBlock, BridgeHandBlock, BiddingTableBlock } from "@/types";
import { parseText, type ParsedItem } from "@/lib/textParser";

// ── Helpers ─────────────────────────────────────────────────────────────────

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Display a bid in human-readable form (stored "1S" → "1♠"). */
function displayBid(text: string): string {
  if (text === "Pass" || text === "Dbl" || text === "Rdbl") return text;
  return text
    .replace(/S$/, "♠")
    .replace(/H$/, "♥")
    .replace(/D$/, "♦")
    .replace(/C$/, "♣");
}

/** Convert a dealer name to the W-N-E-S column offset. */
const DEALER_OFFSET: Record<string, number> = {
  West: 0, North: 1, East: 2, South: 3,
};

// ── Sub-previews ─────────────────────────────────────────────────────────────

function HandPreview({ data }: { data: BridgeHandBlock["data"] }) {
  const SUIT_LABELS = [
    { key: "S" as const, sym: "♠", red: false },
    { key: "H" as const, sym: "♥", red: true  },
    { key: "D" as const, sym: "♦", red: true  },
    { key: "C" as const, sym: "♣", red: false },
  ];

  function HandBox({ dir, label }: { dir: keyof typeof data.hands; label: string }) {
    const hand = data.hands[dir];
    const visible = data.visibleHands[dir];
    return (
      <div className="border border-stone-200 rounded p-1.5 text-center min-w-0">
        <p className="font-sans text-[10px] font-semibold text-stone-400 mb-0.5">{label}</p>
        {visible
          ? SUIT_LABELS.map(({ key, sym, red }) => (
              <div key={key} className={`font-mono text-[10px] leading-tight ${red ? "text-red-600" : "text-stone-800"}`}>
                {sym} {hand[key] || "—"}
              </div>
            ))
          : <span className="text-[10px] text-stone-300 italic">Hidden</span>
        }
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-1 max-w-[200px]">
        <div />
        <HandBox dir="north" label="N" />
        <div />
        <HandBox dir="west" label="W" />
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-stone-200 text-[8px] text-stone-300 flex items-center justify-center">✦</div>
        </div>
        <HandBox dir="east" label="E" />
        <div />
        <HandBox dir="south" label="S" />
        <div />
      </div>
    </div>
  );
}

function AuctionPreview({ data, isBiddingProblem }: { data: BiddingTableBlock["data"]; isBiddingProblem: boolean }) {
  const offset = DEALER_OFFSET[data.dealer] ?? 1;
  const cells: Array<{ text: string; alert: string | null } | null> = [
    ...Array(offset).fill(null),
    ...data.bids,
  ];
  while (cells.length % 4 !== 0) cells.push(null);

  return (
    <div className="mt-2">
      {isBiddingProblem && (
        <p className="text-[10px] font-sans text-amber-600 mb-1">Bidding problem (no auto-close)</p>
      )}
      <div className="grid grid-cols-4 gap-0.5 max-w-[200px] font-mono text-[10px]">
        {["W", "N", "E", "S"].map((s) => (
          <div key={s} className="text-center font-sans font-semibold text-stone-400 border-b border-stone-200 pb-0.5 mb-0.5">
            {s}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isRed = ["H", "D"].some((s) => cell.text.endsWith(s));
          return (
            <div key={i} className={`text-center py-0.5 ${isRed ? "text-red-600" : "text-stone-800"}`}>
              {displayBid(cell.text)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface ParseTextModalProps {
  onInsert: (blocks: ContentBlock[]) => void;
  onClose: () => void;
}

export default function ParseTextModal({ onInsert, onClose }: ParseTextModalProps) {
  const [rawText,  setRawText]  = useState("");
  const [items,    setItems]    = useState<ParsedItem[] | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [encodingFixed, setEncodingFixed] = useState(false);

  function handleParse() {
    const result = parseText(rawText);
    setItems(result.items);
    setSelected(result.items.map(() => true));
    setEncodingFixed(result.encodingFixed);
  }

  function toggleItem(i: number) {
    setSelected((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }

  function handleInsert() {
    if (!items) return;
    const blocks: ContentBlock[] = [];
    items.forEach((item, i) => {
      if (!selected[i]) return;
      const id = newId();
      if (item.kind === "hand") {
        blocks.push({ id, type: "bridgeHand", data: item.data });
      } else if (item.kind === "auction") {
        blocks.push({ id, type: "biddingTable", data: item.data });
      } else {
        blocks.push({ id, type: "text", data: { text: item.text } });
      }
    });
    if (blocks.length > 0) onInsert(blocks);
    onClose();
  }

  const selectedCount = selected.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-sm shadow-xl w-full max-w-2xl mx-4 my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider">
            Parse Text
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">

          {/* Input area */}
          <div>
            <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Paste text from PDF, Word, or plain text
            </label>
            <textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setItems(null); }}
              placeholder={
                "North\n♠ A K Q 7\n♥ K J 8 4\n♦ A 5\n♣ Q 9 6\n\nWest  North  East  South\n-     1♠     P     2NT\nP     3♠     P     4♠\nP     P      P"
              }
              rows={10}
              spellCheck={false}
              className="w-full font-mono text-xs border border-stone-200 rounded px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-stone-400 bg-stone-50"
            />
          </div>

          {/* Encoding notice */}
          {encodingFixed && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs font-sans text-amber-800">
              Bridge World PDF encoding detected and fixed (8→♠ 5→♥ 7→♦ 6→♣).
            </div>
          )}

          {/* Parse button */}
          {!items && (
            <button
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Parse
            </button>
          )}

          {/* Results */}
          {items && items.length === 0 && (
            <div className="border border-stone-200 rounded px-4 py-3 text-center text-sm font-sans text-stone-400">
              No blocks detected. Try pasting hand diagrams or bidding sequences.
            </div>
          )}

          {items && items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500">
                  {items.length} block{items.length !== 1 ? "s" : ""} detected
                </p>
                <button
                  onClick={() => setItems(null)}
                  className="text-xs font-sans text-stone-400 hover:text-stone-700 transition-colors"
                >
                  ← Re-parse
                </button>
              </div>

              {items.map((item, i) => {
                const isSelected = selected[i] ?? false;
                const typeLabel =
                  item.kind === "hand"    ? "Bridge Hand"    :
                  item.kind === "auction" ? "Bidding Table"  : "Text";
                const badgeColor =
                  item.kind === "hand"    ? "bg-blue-50 text-blue-700 border-blue-200"    :
                  item.kind === "auction" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            "bg-stone-50 text-stone-600 border-stone-200";

                return (
                  <div
                    key={i}
                    onClick={() => toggleItem(i)}
                    className={`border rounded cursor-pointer transition-colors p-3 ${
                      isSelected
                        ? "border-stone-400 bg-white"
                        : "border-stone-100 bg-stone-50 opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded"
                      />
                      <span className={`text-xs font-sans font-semibold px-2 py-0.5 rounded border ${badgeColor}`}>
                        {typeLabel}
                      </span>
                      {item.kind === "auction" && (
                        <span className="text-xs font-sans text-stone-400">
                          Dealer: {item.data.dealer} · {item.data.bids.length} bids
                        </span>
                      )}
                    </div>

                    {/* Block preview */}
                    {item.kind === "hand" && (
                      <HandPreview data={item.data} />
                    )}
                    {item.kind === "auction" && (
                      <AuctionPreview data={item.data} isBiddingProblem={item.isBiddingProblem} />
                    )}
                    {item.kind === "text" && (
                      <p className="mt-2 text-xs font-sans text-stone-600 line-clamp-3 whitespace-pre-wrap">
                        {item.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="font-sans text-sm text-stone-600 border border-stone-200 px-4 py-2 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          {items && items.length > 0 && (
            <button
              onClick={handleInsert}
              disabled={selectedCount === 0}
              className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Insert {selectedCount} block{selectedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
