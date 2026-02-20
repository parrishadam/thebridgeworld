import type { CSSProperties } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

interface SuitEntry { symbol: string; color: string }

const SUIT_INFO: Record<string, SuitEntry> = {
  S: { symbol: "♠", color: "#1a1a2e" },
  H: { symbol: "♥", color: "#c0392b" },
  D: { symbol: "♦", color: "#c0392b" },
  C: { symbol: "♣", color: "#1a1a2e" },
};

// When a suit color is the same dark navy as the background, render it white instead.
function suitSymbolColor(suitColor: string): string {
  return suitColor === "#1a1a2e" ? "rgba(255,255,255,0.9)" : suitColor;
}

export interface ArticleCardImageProps {
  title:          string;
  author?:        string;
  authorPhoto?:   string;
  category?:      string;
  categoryColor?: string;
  contract?:      string;
  declarer?:      string;
  hand?:          { S?: string; H?: string; D?: string; C?: string };
  variant?:       "default" | "featured" | "compact";
  /** When true renders at 100%×100% to fill a parent container. */
  fill?:          boolean;
}

// ── Compact variant ─────────────────────────────────────────────────────────

function CompactWithHand({
  author, authorPhoto, contract, declarer, hand, outerStyle,
}: {
  author?: string; authorPhoto?: string; contract?: string; declarer?: string;
  hand: { S?: string; H?: string; D?: string; C?: string };
  outerStyle: CSSProperties;
}) {
  return (
    <div style={{
      ...outerStyle,
      background: "linear-gradient(135deg, #1a1a2e 0%, #2a1f3d 100%)",
      display: "flex",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* Author photo */}
      <div style={{ width: 100, height: 100, flexShrink: 0, position: "relative" }}>
        {authorPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={authorPhoto} alt={author ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.05)",
            fontSize: 32, color: "rgba(197,157,95,0.4)",
          }}>
            ♠
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 60%, #1a1a2e)" }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {contract && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#c59d5f" }}>{contract}</span>
            {declarer && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>by {declarer}</span>}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["S", "H", "D", "C"] as const).map((suit) =>
            hand[suit] ? (
              <span key={suit} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                <span style={{ color: suitSymbolColor(SUIT_INFO[suit].color), fontWeight: 700 }}>
                  {SUIT_INFO[suit].symbol}
                </span>
                {hand[suit]!.replace(/ /g, "")}
              </span>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

// ── Default / Featured with hand ────────────────────────────────────────────

function WithHand({
  title, author, authorPhoto, category, categoryColor = "#64748b",
  contract, declarer, hand, isFeatured, outerStyle,
}: {
  title: string; author?: string; authorPhoto?: string;
  category?: string; categoryColor?: string;
  contract?: string; declarer?: string;
  hand: { S?: string; H?: string; D?: string; C?: string };
  isFeatured: boolean; outerStyle: CSSProperties;
}) {
  const photoSize   = isFeatured ? 200 : 140;
  const photoOffset = isFeatured ? -20 : -15;

  return (
    <div style={{
      ...outerStyle,
      background: "linear-gradient(145deg, #1a1a2e 0%, #2a1f3d 60%, #1a1229 100%)",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    }}>
      {/* Subtle diagonal pattern */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 12px)",
      }} />

      {/* Author photo — circle bleeding off bottom-left */}
      <div style={{
        position: "absolute",
        bottom: photoOffset, left: photoOffset,
        width: photoSize, height: photoSize,
        borderRadius: "50%", overflow: "hidden",
        border: "3px solid rgba(197,157,95,0.3)",
        opacity: 0.85,
      }}>
        {authorPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={authorPhoto} alt={author ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "100%", height: "100%", background: "rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: photoSize * 0.35, color: "rgba(197,157,95,0.3)",
          }}>
            ♠
          </div>
        )}
      </div>

      {/* Radial gradient to fade the photo into the background */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, pointerEvents: "none",
        width: photoSize + 20, height: photoSize + 20,
        background: "radial-gradient(circle at bottom left, transparent 40%, #1a1a2e 100%)",
      }} />

      {/* Category badge */}
      {category && (
        <div style={{
          position: "absolute", top: 12, left: 12,
          background: categoryColor + "33", color: categoryColor,
          padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          textTransform: "uppercase" as const, letterSpacing: 0.8,
          border: `1px solid ${categoryColor}44`,
        }}>
          {category}
        </div>
      )}

      {/* Contract — top right */}
      {contract && (
        <div style={{
          position: "absolute",
          top: isFeatured ? 16 : 12,
          right: isFeatured ? 20 : 14,
          textAlign: "right" as const,
        }}>
          <div style={{
            fontSize: isFeatured ? 42 : 32, fontWeight: 800, color: "#c59d5f",
            lineHeight: 1, letterSpacing: -1,
            fontFamily: "'Georgia', serif",
          }}>
            {contract}
          </div>
          {declarer && (
            <div style={{ fontSize: isFeatured ? 12 : 10, color: "rgba(255,255,255,0.4)", marginTop: 2, letterSpacing: 0.5 }}>
              by {declarer}
            </div>
          )}
        </div>
      )}

      {/* South hand — right side */}
      <div style={{
        position: "absolute",
        right: isFeatured ? 20 : 14,
        top: isFeatured ? 85 : 65,
        display: "flex", flexDirection: "column" as const,
        gap: isFeatured ? 5 : 3,
        textAlign: "right" as const,
      }}>
        {(["S", "H", "D", "C"] as const).map((suit) =>
          hand[suit] ? (
            <div key={suit} style={{
              fontSize: isFeatured ? 16 : 13,
              color: "rgba(255,255,255,0.75)",
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
            }}>
              <span style={{ letterSpacing: 1, fontWeight: 500 }}>{hand[suit]}</span>
              <span style={{
                color: suitSymbolColor(SUIT_INFO[suit].color),
                fontWeight: 700, fontSize: isFeatured ? 18 : 14,
              }}>
                {SUIT_INFO[suit].symbol}
              </span>
            </div>
          ) : null
        )}
      </div>

      {/* Decorative gold line */}
      <div style={{
        position: "absolute",
        bottom: isFeatured ? 56 : 46,
        right: isFeatured ? 20 : 14,
        width: isFeatured ? 60 : 40, height: 2,
        background: "linear-gradient(to right, transparent, #c59d5f)",
      }} />

      {/* Author name + title — bottom right */}
      <div style={{
        position: "absolute",
        bottom: isFeatured ? 16 : 12,
        right: isFeatured ? 20 : 14,
        left: isFeatured ? 180 : 120,
        textAlign: "right" as const,
      }}>
        {author && (
          <div style={{
            fontSize: isFeatured ? 11 : 10,
            color: "rgba(255,255,255,0.4)",
            marginBottom: 3,
            textTransform: "uppercase" as const, letterSpacing: 1,
          }}>
            {author}
          </div>
        )}
        <div style={{
          fontSize: isFeatured ? 18 : 14,
          fontWeight: 700, color: "#fff", lineHeight: 1.3,
          fontFamily: "'Georgia', serif",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}>
          {title}
        </div>
      </div>
    </div>
  );
}

// ── Default / Featured without hand ─────────────────────────────────────────

function NoHand({
  title, author, authorPhoto, category, categoryColor = "#64748b",
  isFeatured, outerStyle,
}: {
  title: string; author?: string; authorPhoto?: string;
  category?: string; categoryColor?: string;
  isFeatured: boolean; outerStyle: CSSProperties;
}) {
  const height = isFeatured ? 340 : 220;

  return (
    <div style={{
      ...outerStyle,
      background: "linear-gradient(145deg, #1a1a2e 0%, #2a1f3d 60%, #1a1229 100%)",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    }}>
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 12px)",
      }} />

      {/* Author photo — large circle, left-center */}
      <div style={{
        position: "absolute", top: "50%", left: "30%",
        transform: "translate(-50%, -50%)",
        width: height * 0.7, height: height * 0.7,
        borderRadius: "50%", overflow: "hidden",
        border: "3px solid rgba(197,157,95,0.2)", opacity: 0.6,
      }}>
        {authorPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={authorPhoto} alt={author ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "100%", height: "100%", background: "rgba(255,255,255,0.03)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ display: "flex", gap: 8 }}>
              {["♠", "♥", "♦", "♣"].map((s, i) => (
                <span key={i} style={{ fontSize: 24, color: "rgba(197,157,95,0.3)" }}>{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Gradient masking the photo to the right */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(to right, transparent 20%, #1a1a2e 70%)",
      }} />

      {/* Category badge */}
      {category && (
        <div style={{
          position: "absolute", top: 12, left: 12,
          background: categoryColor + "33", color: categoryColor,
          padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          textTransform: "uppercase" as const, letterSpacing: 0.8,
          border: `1px solid ${categoryColor}44`,
        }}>
          {category}
        </div>
      )}

      {/* Decorative suit symbols — top right */}
      <div style={{ position: "absolute", top: 20, right: 20, display: "flex", gap: 8 }}>
        {["♠", "♥", "♦", "♣"].map((s, i) => (
          <span key={i} style={{ fontSize: 24, color: "rgba(197,157,95,0.15)" }}>{s}</span>
        ))}
      </div>

      {/* Decorative gold line */}
      <div style={{
        position: "absolute",
        bottom: isFeatured ? 56 : 46, right: 20,
        width: 40, height: 2,
        background: "linear-gradient(to right, transparent, #c59d5f)",
      }} />

      {/* Author + title — bottom right */}
      <div style={{
        position: "absolute",
        bottom: isFeatured ? 16 : 12, right: 20, left: "45%",
        textAlign: "right" as const,
      }}>
        {author && (
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.4)",
            marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: 1,
          }}>
            {author}
          </div>
        )}
        <div style={{
          fontSize: isFeatured ? 18 : 14,
          fontWeight: 700, color: "#fff", lineHeight: 1.3,
          fontFamily: "'Georgia', serif",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}>
          {title}
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export default function ArticleCardImage({
  title,
  author,
  authorPhoto,
  category,
  categoryColor = "#64748b",
  contract,
  declarer,
  hand,
  variant = "default",
  fill = false,
}: ArticleCardImageProps) {
  const isFeatured = variant === "featured";
  const isCompact  = variant === "compact";

  const naturalWidth  = isFeatured ? 600 : 360;
  const naturalHeight = isCompact ? 100 : isFeatured ? 340 : 220;

  const outerStyle: CSSProperties = fill
    ? { width: "100%", height: "100%", position: "relative", overflow: "hidden", borderRadius: 0 }
    : { width: naturalWidth, height: naturalHeight, borderRadius: isCompact ? 8 : 10, position: "relative", overflow: "hidden" };

  const hasHand = hand && (hand.S || hand.H || hand.D || hand.C);

  if (isCompact && hasHand) {
    return (
      <CompactWithHand
        author={author} authorPhoto={authorPhoto}
        contract={contract} declarer={declarer}
        hand={hand!} outerStyle={outerStyle}
      />
    );
  }

  if (hasHand) {
    return (
      <WithHand
        title={title} author={author} authorPhoto={authorPhoto}
        category={category} categoryColor={categoryColor}
        contract={contract} declarer={declarer}
        hand={hand!} isFeatured={isFeatured} outerStyle={outerStyle}
      />
    );
  }

  // Compact without hand — just show the same as default no-hand at compact height
  return (
    <NoHand
      title={title} author={author} authorPhoto={authorPhoto}
      category={category} categoryColor={categoryColor}
      isFeatured={isFeatured} outerStyle={outerStyle}
    />
  );
}
