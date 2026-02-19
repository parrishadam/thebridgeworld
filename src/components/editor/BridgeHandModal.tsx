"use client";

import { useState } from "react";
import type { BridgeHandBlock, Direction, HandCards } from "@/types";

interface BridgeHandModalProps {
  initial?: BridgeHandBlock["data"];
  onSave: (data: BridgeHandBlock["data"]) => void;
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
  initial,
  onSave,
  onClose,
}: BridgeHandModalProps) {
  const [data, setData] = useState<BridgeHandBlock["data"]>(
    initial ?? defaultData()
  );

  function setField<K extends keyof BridgeHandBlock["data"]>(
    key: K,
    value: BridgeHandBlock["data"][K]
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-2xl mx-4 my-8 overflow-hidden">
        {/* Header */}
        <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider">
            Bridge Hand Block
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

          {/* Contract / Lead */}
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Lead
              </label>
              <input
                type="text"
                value={data.lead}
                onChange={(e) => setField("lead", e.target.value)}
                placeholder="e.g. ♥K"
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
            onClick={() => onSave(data)}
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
