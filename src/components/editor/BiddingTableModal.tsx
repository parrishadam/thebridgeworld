"use client";

import { useState } from "react";
import type { BiddingTableBlock } from "@/types";

interface BiddingTableModalProps {
  initial?: BiddingTableBlock["data"];
  onSave: (data: BiddingTableBlock["data"]) => void;
  onClose: () => void;
}

const DEALER_OFFSET: Record<string, number> = {
  West: 0, North: 1, East: 2, South: 3,
};

const LEVELS = ["1", "2", "3", "4", "5", "6", "7"];
const DENOMINATIONS = [
  { label: "♣", value: "C", red: false },
  { label: "♦", value: "D", red: true },
  { label: "♥", value: "H", red: true },
  { label: "♠", value: "S", red: false },
  { label: "NT", value: "NT", red: false },
];

function isBidRed(text: string): boolean {
  return /[HD]/.test(text) && !/[SCNT]/.test(text.slice(-1));
}

export default function BiddingTableModal({
  initial,
  onSave,
  onClose,
}: BiddingTableModalProps) {
  const [dealer, setDealer] = useState(initial?.dealer ?? "North");
  const [bids, setBids]     = useState<Array<{ text: string; alert: string | null }>>(
    initial?.bids ?? []
  );
  const [alertInput, setAlertInput] = useState<string>("");
  const [editingAlert, setEditingAlert] = useState<number | null>(null);

  function addBid(text: string) {
    setBids((prev) => [...prev, { text, alert: null }]);
  }

  function removeLastBid() {
    setBids((prev) => prev.slice(0, -1));
  }

  function setAlert(index: number, alert: string) {
    setBids((prev) =>
      prev.map((b, i) => (i === index ? { ...b, alert: alert || null } : b))
    );
  }

  // Build preview cells
  const offset = DEALER_OFFSET[dealer] ?? 1;
  const cells: Array<{ text: string; alert: string | null } | null> = [
    ...Array(offset).fill(null),
    ...bids,
  ];
  while (cells.length % 4 !== 0) cells.push(null);

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
          {/* Dealer */}
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

          {/* Bid entry buttons */}
          <div>
            <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Add Bid
            </p>
            {/* Pass / Dbl / Rdbl */}
            <div className="flex gap-2 mb-3">
              {["Pass", "Dbl", "Rdbl"].map((b) => (
                <button
                  key={b}
                  onClick={() => addBid(b)}
                  className="font-mono text-sm border border-stone-300 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors text-stone-700"
                >
                  {b}
                </button>
              ))}
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
                          d.red ? "text-red-600" : "text-stone-700"
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
                      <td className="font-sans text-xs text-stone-500 pr-2 text-right">{level}</td>
                      {DENOMINATIONS.map((d) => {
                        const bidText = `${level}${d.value}`;
                        const isRed = d.red;
                        return (
                          <td key={d.value} className="p-0.5">
                            <button
                              onClick={() => addBid(bidText)}
                              className={`w-10 py-1 border border-stone-200 rounded text-xs hover:bg-stone-50 transition-colors ${
                                isRed ? "text-red-600" : "text-stone-800"
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
                {bids.map((bid, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setEditingAlert(editingAlert === i ? null : i);
                      setAlertInput(bid.alert ?? "");
                    }}
                    className={`font-mono text-xs border px-2 py-1 rounded transition-colors ${
                      bid.alert
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-stone-200 text-stone-700 hover:bg-stone-50"
                    } ${editingAlert === i ? "ring-2 ring-blue-400" : ""}`}
                  >
                    {bid.text}
                    {bid.alert && <sup className="text-blue-600 ml-0.5">*</sup>}
                  </button>
                ))}
              </div>
              {editingAlert !== null && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={alertInput}
                    onChange={(e) => setAlertInput(e.target.value)}
                    placeholder="Alert explanation..."
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
                    if (!cell)
                      return <div key={i} className="py-0.5" />;
                    const red = isBidRed(cell.text);
                    return (
                      <div
                        key={i}
                        className={`text-center py-0.5 ${red ? "text-red-600" : "text-stone-800"}`}
                      >
                        {cell.text}
                        {cell.alert && (
                          <sup className="text-blue-600 text-xs ml-0.5">*</sup>
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
