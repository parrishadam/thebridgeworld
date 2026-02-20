import { ImageResponse } from "next/og";
import { getSupabaseArticleBySlug, extractHandData } from "@/lib/articles";
import { getCategoryByName } from "@/lib/categories";

export const runtime = "edge";

const WIDTH  = 1200;
const HEIGHT = 630;

const SUIT_INFO: Record<string, { symbol: string; color: string }> = {
  S: { symbol: "♠", color: "rgba(255,255,255,0.9)" },
  H: { symbol: "♥", color: "#c0392b" },
  D: { symbol: "♦", color: "#c0392b" },
  C: { symbol: "♣", color: "rgba(255,255,255,0.9)" },
};

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const article = await getSupabaseArticleBySlug(params.slug);
  if (!article) {
    return new Response("Not found", { status: 404 });
  }

  // If article has its own featured image, redirect to it
  if (article.featured_image_url) {
    return Response.redirect(article.featured_image_url, 302);
  }

  const catEntry = article.category ? await getCategoryByName(article.category) : null;
  const catColor = catEntry?.color ?? "#64748b";
  const handData = extractHandData(article.content_blocks ?? []);

  const authorPhoto = article.author_photo_url;
  const authorName  = article.author_name ?? "";
  const category    = article.category ?? "";
  const contract    = handData?.contract ?? "";
  const declarer    = handData?.declarer ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width:      WIDTH,
          height:     HEIGHT,
          display:    "flex",
          position:   "relative",
          background: "linear-gradient(145deg, #1a1a2e 0%, #2a1f3d 60%, #1a1229 100%)",
          fontFamily: "system-ui, sans-serif",
          overflow:   "hidden",
        }}
      >
        {/* Subtle diagonal pattern */}
        <div
          style={{
            position:        "absolute",
            inset:           0,
            opacity:         0.03,
            backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 12px)",
          }}
        />

        {/* Author photo — large circle, bottom-left */}
        {authorPhoto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={authorPhoto}
              alt={authorName}
              style={{
                position:     "absolute",
                bottom:       -40,
                left:         -40,
                width:        340,
                height:       340,
                borderRadius: "50%",
                objectFit:    "cover",
                opacity:      0.7,
                border:       "4px solid rgba(197,157,95,0.3)",
              }}
            />
            {/* Radial fade */}
            <div
              style={{
                position:   "absolute",
                bottom:     0,
                left:       0,
                width:      380,
                height:     380,
                background: "radial-gradient(circle at bottom left, transparent 40%, #1a1a2e 100%)",
              }}
            />
          </>
        )}

        {/* No author photo — decorative suit symbols at left */}
        {!authorPhoto && (
          <div
            style={{
              position:   "absolute",
              top:        "50%",
              left:       "25%",
              transform:  "translate(-50%, -50%)",
              display:    "flex",
              gap:        24,
              opacity:    0.08,
            }}
          >
            {["♠", "♥", "♦", "♣"].map((s) => (
              <span key={s} style={{ fontSize: 100, color: "#c59d5f" }}>{s}</span>
            ))}
          </div>
        )}

        {/* Gradient overlay to push content right */}
        <div
          style={{
            position:   "absolute",
            inset:      0,
            background: "linear-gradient(to right, transparent 25%, #1a1a2e 65%)",
          }}
        />

        {/* Category badge — top left */}
        {category && (
          <div
            style={{
              position:      "absolute",
              top:           40,
              left:          40,
              background:    catColor + "33",
              color:         catColor,
              padding:       "6px 20px",
              borderRadius:  6,
              fontSize:      18,
              fontWeight:    700,
              textTransform: "uppercase",
              letterSpacing: 2,
              border:        `1.5px solid ${catColor}44`,
              display:       "flex",
            }}
          >
            {category}
          </div>
        )}

        {/* Contract — top right */}
        {contract && (
          <div
            style={{
              position:  "absolute",
              top:       40,
              right:     60,
              textAlign: "right",
              display:   "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <span style={{ fontSize: 72, fontWeight: 800, color: "#c59d5f", lineHeight: 1, letterSpacing: -2 }}>
              {contract}
            </span>
            {declarer && (
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                by {declarer}
              </span>
            )}
          </div>
        )}

        {/* South hand — right side */}
        {handData && (
          <div
            style={{
              position:      "absolute",
              right:         60,
              top:           contract ? 160 : 80,
              display:       "flex",
              flexDirection: "column",
              gap:           10,
              textAlign:     "right",
            }}
          >
            {(["S", "H", "D", "C"] as const).map((suit) =>
              handData[suit] ? (
                <div
                  key={suit}
                  style={{
                    fontSize:       28,
                    color:          "rgba(255,255,255,0.8)",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "flex-end",
                    gap:            8,
                  }}
                >
                  <span style={{ letterSpacing: 2 }}>{handData[suit]}</span>
                  <span style={{ color: SUIT_INFO[suit].color, fontWeight: 700, fontSize: 32 }}>
                    {SUIT_INFO[suit].symbol}
                  </span>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Gold line */}
        <div
          style={{
            position:   "absolute",
            bottom:     100,
            right:      60,
            width:      80,
            height:     3,
            background: "linear-gradient(to right, transparent, #c59d5f)",
          }}
        />

        {/* Author + title — bottom right */}
        <div
          style={{
            position:  "absolute",
            bottom:    50,
            right:     60,
            left:      "40%",
            textAlign: "right",
            display:   "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          {authorName && (
            <span
              style={{
                fontSize:      20,
                color:         "rgba(255,255,255,0.4)",
                marginBottom:  10,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {authorName}
            </span>
          )}
          <span
            style={{
              fontSize:   contract || handData ? 36 : 52,
              fontWeight: 700,
              color:      "#fff",
              lineHeight: 1.25,
            }}
          >
            {article.title}
          </span>
        </div>

        {/* Bridge World watermark */}
        <div
          style={{
            position:      "absolute",
            top:           40,
            left:          "50%",
            transform:     "translateX(-50%)",
            fontSize:      16,
            color:         "rgba(197,157,95,0.35)",
            textTransform: "uppercase",
            letterSpacing: 4,
            display:       "flex",
          }}
        >
          Bridge World
        </div>
      </div>
    ),
    {
      width:  WIDTH,
      height: HEIGHT,
    }
  );
}
