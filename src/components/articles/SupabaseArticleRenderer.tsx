"use client";

import { useState } from "react";
import type {
  ContentBlock,
  BridgeHandBlock,
  BiddingTableBlock,
  MSCResultsBlock,
  SolutionBlock,
  HandCards,
} from "@/types";
import BridgePlayTable from "@/components/play/BridgePlayTable";

// ── Suit helpers ───────────────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, { symbol: string; className: string }> = {
  S: { symbol: "♠", className: "text-stone-900" },
  H: { symbol: "♥", className: "text-red-600" },
  D: { symbol: "♦", className: "text-red-600" },
  C: { symbol: "♣", className: "text-stone-900" },
};

const SUIT_CHAR_MAP: Record<string, string> = {
  S: "♠", H: "♥", D: "♦", C: "♣",
};

function HandDisplay({
  cards,
  visible,
}: {
  cards: HandCards;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="font-mono text-sm space-y-0.5">
      {(["S", "H", "D", "C"] as const).map((key) => {
        const { symbol, className } = SUIT_SYMBOLS[key];
        const value = cards[key] || "—";
        return (
          <div key={key} className="flex gap-1.5 items-baseline">
            <span className={`${className} w-4 text-center`}>{symbol}</span>
            <span className="tracking-wide">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Format contract/lead with suit symbols ──────────────────────────────────

/** Convert letter-form contract to suit symbols: "4S" → "4♠", "3NT" stays "3NT" */
function formatContract(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/([1-7])(NT|[CDHS])/g, (_, level: string, suit: string) => {
    if (suit === "NT") return `${level}NT`;
    return `${level}${SUIT_CHAR_MAP[suit] ?? suit}`;
  });
}

/** Convert letter-form lead to suit symbols: "HK" → "♥K", "DA" → "♦A" */
function formatLead(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/^([CDHS])(.+)$/, (_, suit: string, rest: string) => {
    return `${SUIT_CHAR_MAP[suit] ?? suit}${rest}`;
  });
}

// ── Bridge hand renderer ───────────────────────────────────────────────────

function BridgeHandRenderer({ block }: { block: BridgeHandBlock }) {
  const { data } = block;
  const vulLabels: Record<string, string> = {
    None: "None", "N-S": "N/S", "E-W": "E/W", All: "All",
  };

  const defaultHand: HandCards = { S: "", H: "", D: "", C: "" };

  // Only show title bar if title is truthy and not a generic placeholder
  const showTitle = data.title && !/^bridge\s*hand$/i.test(data.title.trim());

  return (
    <figure className="my-8 border border-stone-200 rounded-sm overflow-hidden not-prose">
      {/* Header */}
      {showTitle && (
        <div className="bg-stone-800 text-white px-4 py-2 flex items-center justify-between">
          <span className="font-serif text-sm font-semibold">
            {data.title}
          </span>
          <div className="flex gap-4 text-xs text-stone-300 font-sans">
            {data.dealer && <span>Dealer: {data.dealer}</span>}
            {data.vulnerability && (
              <span>Vul: {vulLabels[data.vulnerability] ?? data.vulnerability}</span>
            )}
          </div>
        </div>
      )}

      {/* Compass grid */}
      <div className="bg-stone-50 p-4">
        <div className="grid grid-cols-3 max-w-xs mx-auto gap-2 text-sm">
          {/* North */}
          <div />
          {data.visibleHands?.north ? (
            <div className="border border-stone-200 bg-white rounded p-2">
              <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">N</p>
              <HandDisplay
                cards={data.hands?.north ?? defaultHand}
                visible={true}
              />
            </div>
          ) : <div />}
          <div />
          {/* West / centre / East */}
          {data.visibleHands?.west ? (
            <div className="border border-stone-200 bg-white rounded p-2">
              <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">W</p>
              <HandDisplay
                cards={data.hands?.west ?? defaultHand}
                visible={true}
              />
            </div>
          ) : <div />}
          <div className="flex items-center justify-center">
            <div className="w-10 h-10 border border-stone-300 rounded-full flex items-center justify-center text-stone-300 text-lg select-none">
              ✦
            </div>
          </div>
          {data.visibleHands?.east ? (
            <div className="border border-stone-200 bg-white rounded p-2">
              <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">E</p>
              <HandDisplay
                cards={data.hands?.east ?? defaultHand}
                visible={true}
              />
            </div>
          ) : <div />}
          {/* South */}
          <div />
          {data.visibleHands?.south ? (
            <div className="border border-stone-200 bg-white rounded p-2">
              <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">S</p>
              <HandDisplay
                cards={data.hands?.south ?? defaultHand}
                visible={true}
              />
            </div>
          ) : <div />}
          <div />
        </div>
      </div>

      {/* Contract & lead */}
      {(data.contract || data.lead) && (
        <div className="border-t border-stone-200 px-4 py-2 flex gap-6 text-sm font-sans bg-stone-50">
          {data.contract && (
            <span>
              <span className="text-stone-400 text-xs">Contract: </span>
              {formatContract(data.contract)}
            </span>
          )}
          {data.lead && (
            <span>
              <span className="text-stone-400 text-xs">Lead: </span>
              {formatLead(data.lead)}
            </span>
          )}
        </div>
      )}
    </figure>
  );
}

// ── Bid display helpers ───────────────────────────────────────────────────

const BID_SUIT_MAP: Record<string, string> = {
  C: "\u2663", // ♣
  D: "\u2666", // ♦
  H: "\u2665", // ♥
  S: "\u2660", // ♠
};

/** Convert letter-format bids (e.g. "1C", "3NT") to display with suit symbols. */
function formatBid(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(
    /([1-7])([CDHS])(?![A-Za-z])/g,
    (_, level: string, suit: string) => `${level}${BID_SUIT_MAP[suit]}`,
  );
}

/** Convert inline bid references in text to suit symbols. */
function formatBidsInText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(
    /\b([1-7])([CDHS])\b/g,
    (_, level: string, suit: string) => `${level}${BID_SUIT_MAP[suit]}`,
  );
}

// ── Bidding table renderer ─────────────────────────────────────────────────

const DEALER_OFFSET: Record<string, number> = {
  West: 0, North: 1, East: 2, South: 3,
};

const DIRECTION_KEYS = ["west", "north", "east", "south"] as const;

function BiddingTableRenderer({ block }: { block: BiddingTableBlock }) {
  const { data } = block;
  const bids = data.bids ?? [];
  const players = data.players;
  const seats = data.seats;

  // 2-player mode: show only the specified seats (e.g. West & East for CTC)
  if (seats && seats.length === 2) {
    return <TwoPlayerBiddingTable data={data} bids={bids} players={players} seats={seats} />;
  }

  // Standard 4-player mode
  const offset = DEALER_OFFSET[data.dealer] ?? 0;

  // Pad with empty cells at start for dealer offset
  const cells: Array<{ text: string; alert: string | null } | null> = [
    ...Array(offset).fill(null),
    ...bids,
  ];
  // Pad to multiple of 4
  while (cells.length % 4 !== 0) cells.push(null);

  return (
    <figure className="my-6 border border-stone-200 rounded-sm overflow-hidden not-prose">
      {data.label && (
        <div className="px-4 pt-3 pb-1">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
            {data.label}
          </p>
        </div>
      )}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-1 max-w-xs font-mono text-sm">
          {(["W", "N", "E", "S"] as const).map((seat, i) => (
            <div
              key={seat}
              className="text-center text-xs font-sans pb-1 border-b border-stone-200 mb-1"
            >
              <span className="font-semibold text-stone-400">{seat}</span>
              {players?.[DIRECTION_KEYS[i]] && (
                <span className="block text-stone-500 font-normal truncate">
                  {players[DIRECTION_KEYS[i]]}
                </span>
              )}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={i} />;
            }
            return (
              <div
                key={i}
                className="text-center py-0.5 relative text-stone-800"
              >
                {formatBid(cell.text)}
                {cell.alert && (
                  <sup className="text-xs text-blue-600 ml-0.5">*</sup>
                )}
              </div>
            );
          })}
        </div>
        {/* Alert legend */}
        {bids.some((b) => b.alert) && (
          <div className="mt-3 space-y-0.5">
            {bids
              .filter((b) => b.alert)
              .map((b, i) => (
                <p key={i} className="text-xs font-sans text-stone-500">
                  <span className="text-blue-600">*</span> {formatBid(b.text)}: {b.alert}
                </p>
              ))}
          </div>
        )}
      </div>
    </figure>
  );
}

// ── Two-player bidding table (CTC format) ────────────────────────────────

const SEAT_ABBREV: Record<string, string> = {
  west: "W", north: "N", east: "E", south: "S",
};

function TwoPlayerBiddingTable({
  data,
  bids,
  players,
  seats,
}: {
  data: BiddingTableBlock["data"];
  bids: Array<{ text: string; alert: string | null }>;
  players?: Partial<Record<string, string>>;
  seats: string[];
}) {
  const offset = DEALER_OFFSET[data.dealer] ?? 0;

  // Map seats to their column indices in the 4-player layout
  const seatToCol: Record<string, number> = {
    west: 0, north: 1, east: 2, south: 3,
  };
  const primaryCols = new Set(seats.map(s => seatToCol[s]));

  // Build 4-player cells (same as standard mode)
  const allCells: Array<{ text: string; alert: string | null } | null> = [
    ...Array(offset).fill(null),
    ...bids,
  ];
  while (allCells.length % 4 !== 0) allCells.push(null);

  // Build rows: each row has the two primary bids + any opponent bids between them
  const rows: Array<{
    left: { text: string; alert: string | null } | null;
    right: { text: string; alert: string | null } | null;
    opponentBids: Array<{ text: string; seat: string }>;
  }> = [];

  for (let rowStart = 0; rowStart < allCells.length; rowStart += 4) {
    const rowCells = allCells.slice(rowStart, rowStart + 4);
    const leftCol = seatToCol[seats[0]];
    const rightCol = seatToCol[seats[1]];
    const left = rowCells[leftCol] ?? null;
    const right = rowCells[rightCol] ?? null;

    // Collect opponent bids from this row
    const opps: Array<{ text: string; seat: string }> = [];
    for (let c = 0; c < 4; c++) {
      if (!primaryCols.has(c) && rowCells[c]) {
        const seatName = DIRECTION_KEYS[c];
        const bidText = rowCells[c]!.text;
        if (bidText && bidText.toLowerCase() !== "pass") {
          opps.push({ text: bidText, seat: SEAT_ABBREV[seatName] });
        }
      }
    }

    // Skip entirely empty rows
    if (left || right || opps.length > 0) {
      rows.push({ left, right, opponentBids: opps });
    }
  }

  const leftSeat = SEAT_ABBREV[seats[0]] || seats[0];
  const rightSeat = SEAT_ABBREV[seats[1]] || seats[1];
  const leftPlayer = players?.[seats[0]];
  const rightPlayer = players?.[seats[1]];

  return (
    <figure className="my-6 border border-stone-200 rounded-sm overflow-hidden not-prose">
      {data.label && (
        <div className="px-4 pt-3 pb-1">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
            {data.label}
          </p>
        </div>
      )}
      <div className="p-4">
        <div className="max-w-[200px] font-mono text-sm">
          {/* Header row */}
          <div className="grid grid-cols-2 gap-4 mb-1 pb-1 border-b border-stone-200">
            <div className="text-center text-xs font-sans">
              <span className="font-semibold text-stone-400">{leftSeat}</span>
              {leftPlayer && (
                <span className="block text-stone-500 font-normal truncate">{leftPlayer}</span>
              )}
            </div>
            <div className="text-center text-xs font-sans">
              <span className="font-semibold text-stone-400">{rightSeat}</span>
              {rightPlayer && (
                <span className="block text-stone-500 font-normal truncate">{rightPlayer}</span>
              )}
            </div>
          </div>
          {/* Bid rows */}
          {rows.map((row, ri) => (
            <div key={ri}>
              {/* Opponent bids row (if any non-pass opponent bids) */}
              {row.opponentBids.length > 0 && (
                <div className="text-center py-0.5 text-xs text-stone-400 italic font-sans">
                  ({row.opponentBids.map(o => `${o.seat}: ${formatBid(o.text)}`).join(", ")})
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center py-0.5 text-stone-800">
                  {row.left ? (
                    <>
                      {formatBid(row.left.text)}
                      {row.left.alert && <sup className="text-xs text-blue-600 ml-0.5">*</sup>}
                    </>
                  ) : ""}
                </div>
                <div className="text-center py-0.5 text-stone-800">
                  {row.right ? (
                    <>
                      {formatBid(row.right.text)}
                      {row.right.alert && <sup className="text-xs text-blue-600 ml-0.5">*</sup>}
                    </>
                  ) : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Alert legend */}
        {bids.some((b) => b.alert) && (
          <div className="mt-3 space-y-0.5">
            {bids
              .filter((b) => b.alert)
              .map((b, i) => (
                <p key={i} className="text-xs font-sans text-stone-500">
                  <span className="text-blue-600">*</span> {formatBid(b.text)}: {b.alert}
                </p>
              ))}
          </div>
        )}
      </div>
    </figure>
  );
}

// ── MSC Results renderer ─────────────────────────────────────────────────

function MSCResultsRenderer({ block }: { block: MSCResultsBlock }) {
  const { results } = block.data;
  return (
    <figure className="my-6 border border-stone-200 rounded-sm overflow-hidden not-prose">
      <div className="p-4">
        <table className="w-full max-w-xs font-sans text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-400 uppercase tracking-wider">
              <th className="py-1.5 pr-4">Action</th>
              <th className="py-1.5 pr-4 text-right">Score</th>
              <th className="py-1.5 text-right">Votes</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-b border-stone-100">
                <td className="py-1.5 pr-4 font-mono text-stone-800">
                  {formatBid(r.action)}
                </td>
                <td className="py-1.5 pr-4 text-right font-mono text-stone-700">
                  {r.score}
                </td>
                <td className="py-1.5 text-right font-mono text-stone-500">
                  {r.votes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ── Solution block renderer ──────────────────────────────────────────────

function SolutionBlockRenderer({ block }: { block: SolutionBlock }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-6 border border-stone-200 rounded-sm overflow-hidden not-prose">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
      >
        <span className="text-stone-400 text-sm transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ▶
        </span>
        <span className="font-sans text-sm font-semibold text-stone-600">
          {block.data.label || "Show Solution"}
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-stone-200">
          <SupabaseArticleRenderer blocks={block.data.blocks} />
        </div>
      )}
    </div>
  );
}

// ── Text renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  // Convert bid abbreviations to suit symbols before rendering markdown
  const withBids = formatBidsInText(text);
  // Split on **bold** and *italic*, handling both
  const parts = withBids.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-stone-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function TextRenderer({ text }: { text: string }) {
  if (!text) return null;
  const paragraphs = text.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} className="mb-4 leading-relaxed">
          {renderInline(para)}
        </p>
      ))}
    </>
  );
}

// ── Video URL helper ──────────────────────────────────────────────────────

function getEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // YouTube
  const ytMatch =
    url.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return null;
}

// ── Public renderer ───────────────────────────────────────────────────────

export default function SupabaseArticleRenderer({
  blocks,
}: {
  blocks: ContentBlock[];
}) {
  // Debug: log block types on render to trace solution blocks
  if (typeof window !== "undefined" && blocks.length > 0) {
    const types = blocks.map(b => b.type);
    const hasSolution = types.includes("solution");
    if (hasSolution) {
      console.log(`[Renderer] Rendering ${blocks.length} blocks, ${types.filter(t => t === "solution").length} SolutionBlock(s)`);
    }
  }

  return (
    <div className="font-sans text-stone-700 text-base leading-relaxed">
      {blocks.map((block) => {
        switch (block.type) {
          case "text":
            return <TextRenderer key={block.id} text={block.data.text} />;

          case "bridgeHand":
            return <BridgeHandRenderer key={block.id} block={block} />;

          case "biddingTable":
            return <BiddingTableRenderer key={block.id} block={block} />;

          case "playHand":
            return <BridgePlayTable key={block.id} deal={block.data} />;

          case "mscResults":
            return <MSCResultsRenderer key={block.id} block={block} />;

          case "solution":
            return <SolutionBlockRenderer key={block.id} block={block} />;

          case "image":
            return (
              <figure key={block.id} className="my-8 not-prose">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.data.url}
                  alt={block.data.caption || ""}
                  className="w-full rounded-sm"
                />
                {block.data.caption && (
                  <figcaption className="mt-2 text-center text-xs text-stone-400 font-sans">
                    {block.data.caption}
                  </figcaption>
                )}
              </figure>
            );

          case "video": {
            const embedUrl = getEmbedUrl(block.data.url);
            if (!embedUrl) {
              return (
                <div key={block.id} className="my-6 text-stone-400 font-sans text-sm italic">
                  Video: {block.data.url}
                </div>
              );
            }
            return (
              <figure key={block.id} className="my-8 not-prose">
                <div className="aspect-video rounded-sm overflow-hidden bg-stone-100">
                  <iframe
                    src={embedUrl}
                    title={block.data.caption || "Video"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
                {block.data.caption && (
                  <figcaption className="mt-2 text-center text-xs text-stone-400 font-sans">
                    {block.data.caption}
                  </figcaption>
                )}
              </figure>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}
