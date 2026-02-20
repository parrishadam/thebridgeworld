import type {
  ContentBlock,
  BridgeHandBlock,
  BiddingTableBlock,
  HandCards,
} from "@/types";

// ── Suit helpers ───────────────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, { symbol: string; className: string }> = {
  S: { symbol: "♠", className: "text-stone-900" },
  H: { symbol: "♥", className: "text-red-600" },
  D: { symbol: "♦", className: "text-red-600" },
  C: { symbol: "♣", className: "text-stone-900" },
};

function HandDisplay({
  cards,
  visible,
}: {
  cards: HandCards;
  visible: boolean;
}) {
  if (!visible) {
    return (
      <div className="font-mono text-sm space-y-0.5 text-stone-300 italic text-xs text-center py-2">
        Hidden
      </div>
    );
  }

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

// ── Bridge hand renderer ───────────────────────────────────────────────────

function BridgeHandRenderer({ block }: { block: BridgeHandBlock }) {
  const { data } = block;
  const vulLabels: Record<string, string> = {
    None: "None", "N-S": "N/S", "E-W": "E/W", All: "All",
  };

  const defaultHand: HandCards = { S: "", H: "", D: "", C: "" };

  return (
    <figure className="my-8 border border-stone-200 rounded-sm overflow-hidden not-prose">
      {/* Header */}
      <div className="bg-stone-800 text-white px-4 py-2 flex items-center justify-between">
        <span className="font-serif text-sm font-semibold">
          {data.title || "Bridge Hand"}
        </span>
        <div className="flex gap-4 text-xs text-stone-300 font-sans">
          {data.dealer && <span>Dealer: {data.dealer}</span>}
          {data.vulnerability && (
            <span>Vul: {vulLabels[data.vulnerability] ?? data.vulnerability}</span>
          )}
        </div>
      </div>

      {/* Compass grid */}
      <div className="bg-stone-50 p-4">
        <div className="grid grid-cols-3 max-w-xs mx-auto gap-2 text-sm">
          {/* North */}
          <div />
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">N</p>
            <HandDisplay
              cards={data.hands?.north ?? defaultHand}
              visible={data.visibleHands?.north ?? true}
            />
          </div>
          <div />
          {/* West / centre / East */}
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">W</p>
            <HandDisplay
              cards={data.hands?.west ?? defaultHand}
              visible={data.visibleHands?.west ?? true}
            />
          </div>
          <div className="flex items-center justify-center">
            <div className="w-10 h-10 border border-stone-300 rounded-full flex items-center justify-center text-stone-300 text-lg select-none">
              ✦
            </div>
          </div>
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">E</p>
            <HandDisplay
              cards={data.hands?.east ?? defaultHand}
              visible={data.visibleHands?.east ?? true}
            />
          </div>
          {/* South */}
          <div />
          <div className="border border-stone-200 bg-white rounded p-2">
            <p className="text-xs font-sans font-semibold text-stone-400 mb-1 text-center">S</p>
            <HandDisplay
              cards={data.hands?.south ?? defaultHand}
              visible={data.visibleHands?.south ?? true}
            />
          </div>
          <div />
        </div>
      </div>

      {/* Contract & lead */}
      {(data.contract || data.lead) && (
        <div className="border-t border-stone-200 px-4 py-2 flex gap-6 text-sm font-sans bg-stone-50">
          {data.contract && (
            <span>
              <span className="text-stone-400 text-xs">Contract: </span>
              {data.contract}
            </span>
          )}
          {data.lead && (
            <span>
              <span className="text-stone-400 text-xs">Lead: </span>
              {data.lead}
            </span>
          )}
        </div>
      )}
    </figure>
  );
}

// ── Bidding table renderer ─────────────────────────────────────────────────

const DEALER_OFFSET: Record<string, number> = {
  West: 0, North: 1, East: 2, South: 3,
};

function isBidRed(text: string): boolean {
  return /[HD]/.test(text) && !/[SCNT]/.test(text.slice(-1));
}

function BiddingTableRenderer({ block }: { block: BiddingTableBlock }) {
  const { data } = block;
  const offset = DEALER_OFFSET[data.dealer] ?? 0;
  const bids = data.bids ?? [];

  // Pad with empty cells at start for dealer offset
  const cells: Array<{ text: string; alert: string | null } | null> = [
    ...Array(offset).fill(null),
    ...bids,
  ];
  // Pad to multiple of 4
  while (cells.length % 4 !== 0) cells.push(null);

  return (
    <figure className="my-6 border border-stone-200 rounded-sm overflow-hidden not-prose">
      <div className="p-4">
        <div className="grid grid-cols-4 gap-1 max-w-xs font-mono text-sm">
          {["W", "N", "E", "S"].map((seat) => (
            <div
              key={seat}
              className="text-center text-xs font-sans font-semibold text-stone-400 pb-1 border-b border-stone-200 mb-1"
            >
              {seat}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={i} />;
            }
            const red = isBidRed(cell.text);
            return (
              <div
                key={i}
                className={`text-center py-0.5 relative ${red ? "text-red-600" : "text-stone-800"}`}
              >
                {cell.text}
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
                  <span className="text-blue-600">*</span> {b.text}: {b.alert}
                </p>
              ))}
          </div>
        )}
      </div>
    </figure>
  );
}

// ── Text renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  // Split on **bold** and *italic*, handling both
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
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

function getEmbedUrl(url: string): string | null {
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
