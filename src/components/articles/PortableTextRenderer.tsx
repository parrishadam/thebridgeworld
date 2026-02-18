import { PortableText, PortableTextComponents } from "@portabletext/react";
import { urlFor } from "@/lib/sanity";
import type { BridgeHandData, BidTableData, SanityBlock } from "@/types";

// ── Suit helpers ──────────────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, { symbol: string; className: string }> = {
  spades:   { symbol: "♠", className: "text-stone-900" },
  hearts:   { symbol: "♥", className: "text-red-600" },
  diamonds: { symbol: "♦", className: "text-red-600" },
  clubs:    { symbol: "♣", className: "text-stone-900" },
};

/** Render a single hand string like "S: AKJ4 H: T93 D: QJ C: 852" */
function HandDisplay({ hand }: { hand?: string }) {
  if (!hand) return <span className="text-stone-400 italic text-xs">—</span>;

  // Parse "S: AKJ4 H: T93 D: QJ C: 852"
  const suits = [
    { key: "S", suit: "spades" },
    { key: "H", suit: "hearts" },
    { key: "D", suit: "diamonds" },
    { key: "C", suit: "clubs" },
  ];

  return (
    <div className="font-mono text-sm space-y-0.5">
      {suits.map(({ key, suit }) => {
        const match = hand.match(new RegExp(`${key}:\\s*([A-Z0-9]+)`));
        const cards = match ? match[1] : "—";
        const { symbol, className } = SUIT_SYMBOLS[suit];
        return (
          <div key={key} className="flex gap-1.5 items-baseline">
            <span className={`${className} w-4 text-center`}>{symbol}</span>
            <span className="tracking-wide">{cards}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Bridge hand block ─────────────────────────────────────────────────────

function BridgeHandBlock({ value }: { value: BridgeHandData }) {
  const vulLabels: Record<string, string> = {
    none: "None", ns: "N/S", ew: "E/W", all: "All",
  };

  return (
    <figure className="my-8 border border-stone-200 rounded-sm overflow-hidden not-prose">
      {/* Header */}
      <div className="bg-stone-800 text-white px-4 py-2 flex items-center justify-between">
        <span className="font-serif text-sm font-semibold">
          {value.title ?? "Bridge Hand"}
        </span>
        <div className="flex gap-4 text-xs text-stone-300 font-sans">
          {value.dealer && <span>Dealer: {value.dealer}</span>}
          {value.vulnerability && (
            <span>Vul: {vulLabels[value.vulnerability] ?? value.vulnerability}</span>
          )}
        </div>
      </div>

      {/* Compass diagram */}
      <div className="bg-stone-50 p-4">
        <div className="grid grid-cols-3 max-w-xs mx-auto gap-2 text-sm">
          {/* North */}
          <div />
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">N</p>
            <HandDisplay hand={value.north} />
          </div>
          <div />
          {/* West / compass centre / East */}
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">W</p>
            <HandDisplay hand={value.west} />
          </div>
          <div className="flex items-center justify-center">
            <div className="w-10 h-10 border border-stone-300 rounded-full flex items-center justify-center text-stone-300 text-lg select-none">
              ✦
            </div>
          </div>
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">E</p>
            <HandDisplay hand={value.east} />
          </div>
          {/* South */}
          <div />
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">S</p>
            <HandDisplay hand={value.south} />
          </div>
          <div />
        </div>
      </div>

      {/* Auction */}
      {value.auction && value.auction.length > 0 && (
        <div className="border-t border-stone-200 px-4 py-3">
          <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-400 mb-2">
            Auction
          </p>
          <div className="grid grid-cols-4 gap-1 max-w-xs font-mono text-sm">
            {["W", "N", "E", "S"].map((seat) => (
              <div key={seat} className="text-center text-xs font-sans text-stone-400 pb-1 border-b border-stone-100">
                {seat}
              </div>
            ))}
            {value.auction.map((bid, i) => {
              const isRed = /^(P|X|XX|\d[HDNT])/.test(bid) &&
                /[HD]/.test(bid) && !/[SCNT]/.test(bid.slice(-1));
              return (
                <div key={i} className={`text-center ${isRed ? "text-red-600" : "text-stone-800"}`}>
                  {bid}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contract & lead */}
      {(value.contract || value.lead) && (
        <div className="border-t border-stone-200 px-4 py-2 flex gap-6 text-sm font-sans bg-stone-50">
          {value.contract && (
            <span><span className="text-stone-400 text-xs">Contract: </span>{value.contract}</span>
          )}
          {value.lead && (
            <span><span className="text-stone-400 text-xs">Lead: </span>{value.lead}</span>
          )}
        </div>
      )}

      {/* Notes */}
      {value.notes && (
        <div className="border-t border-stone-200 px-4 py-3">
          <p className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-400 mb-1">
            Analysis
          </p>
          <p className="text-sm text-stone-600 leading-relaxed font-sans whitespace-pre-line">
            {value.notes}
          </p>
        </div>
      )}
    </figure>
  );
}

// ── Bid table block ───────────────────────────────────────────────────────

function BidTableBlock({ value }: { value: BidTableData }) {
  const bids = value.bids ?? [];
  // Pad to a multiple of 4 so the grid fills cleanly
  const padded = [...bids];
  while (padded.length % 4 !== 0) padded.push("");

  return (
    <figure className="my-6 border border-stone-200 rounded-sm overflow-hidden not-prose">
      {value.title && (
        <div className="bg-stone-100 px-4 py-2 border-b border-stone-200">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
            {value.title}
          </span>
        </div>
      )}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-1 max-w-xs font-mono text-sm">
          {["W", "N", "E", "S"].map((seat) => (
            <div key={seat} className="text-center text-xs font-sans font-semibold text-stone-400 pb-1 border-b border-stone-200 mb-1">
              {seat}
            </div>
          ))}
          {padded.map((bid, i) => {
            const isRed = bid && /[HD]/.test(bid) && !/[SCNT]/.test(bid.slice(-1));
            return (
              <div key={i} className={`text-center py-0.5 ${isRed ? "text-red-600" : "text-stone-800"} ${!bid ? "text-stone-200" : ""}`}>
                {bid || "—"}
              </div>
            );
          })}
        </div>
        {value.notes && (
          <p className="mt-3 text-xs text-stone-500 font-sans leading-relaxed">{value.notes}</p>
        )}
      </div>
    </figure>
  );
}

// ── Portable Text component map ───────────────────────────────────────────

const components: PortableTextComponents = {
  block: {
    normal:     ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
    h2:         ({ children }) => <h2 className="font-serif text-2xl font-bold mt-10 mb-4 text-stone-900">{children}</h2>,
    h3:         ({ children }) => <h3 className="font-serif text-xl font-bold mt-8 mb-3 text-stone-900">{children}</h3>,
    h4:         ({ children }) => <h4 className="font-serif text-lg font-semibold mt-6 mb-2 text-stone-900">{children}</h4>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-brand-400 pl-4 my-6 italic text-stone-600 font-serif text-lg">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet:   ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
    number:   ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
  },
  listItem: {
    bullet: ({ children }) => <li className="leading-relaxed">{children}</li>,
    number: ({ children }) => <li className="leading-relaxed">{children}</li>,
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
    em:     ({ children }) => <em>{children}</em>,
    code:   ({ children }) => (
      <code className="font-mono text-sm bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded">
        {children}
      </code>
    ),
    "strike-through": ({ children }) => <s>{children}</s>,
    link: ({ value, children }) => (
      <a
        href={value?.href}
        target={value?.blank ? "_blank" : undefined}
        rel={value?.blank ? "noopener noreferrer" : undefined}
        className="text-brand-700 underline underline-offset-2 hover:text-brand-900"
      >
        {children}
      </a>
    ),
    suit: ({ value, children }) => {
      const isRed = value?.suit === "hearts" || value?.suit === "diamonds";
      return (
        <span className={isRed ? "text-red-600 font-semibold" : "text-stone-900 font-semibold"}>
          {children}
        </span>
      );
    },
  },
  types: {
    image: ({ value }) => {
      if (!value?.asset) return null;
      return (
        <figure className="my-8 not-prose">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urlFor(value).width(900).url()}
            alt={value.alt ?? ""}
            className="w-full rounded-sm"
          />
          {value.caption && (
            <figcaption className="mt-2 text-center text-xs text-stone-400 font-sans">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
    bridgeHand: ({ value }) => <BridgeHandBlock value={value} />,
    bidTable:   ({ value }) => <BidTableBlock value={value} />,
  },
};

// ── Public component ──────────────────────────────────────────────────────

export default function PortableTextRenderer({ content }: { content: SanityBlock[] }) {
  return (
    <div className="font-sans text-stone-700 text-base leading-relaxed">
      <PortableText value={content} components={components} />
    </div>
  );
}
