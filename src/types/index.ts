// ── Subscription types ─────────────────────────────────────────────────────

export type SubscriptionTier = "free" | "paid" | "premium";
export type ArticleAccessTier = "free" | "paid" | "premium";

export interface UserProfile {
  user_id:        string;
  tier:           SubscriptionTier;
  is_admin:       boolean;
  is_contributor: boolean;
  is_author:      boolean;
  is_legacy:      boolean;
  bio:            string | null;
  created_at:     string;
  updated_at:     string;
}

export interface SubscriptionStatus {
  tier:          SubscriptionTier;
  isAdmin:       boolean;
  isContributor: boolean;
  isAuthor:      boolean;
}

// ── Category ───────────────────────────────────────────────────────────────

export interface Category {
  id:           string;
  name:         string;
  slug:         string;
  description:  string | null;
  color:        string | null;
  sort_order:   number;
  created_at:   string;
}

// ── Tag ────────────────────────────────────────────────────────────────────

export interface Tag {
  id:         string;
  name:       string;
  slug:       string;
  created_at: string;
}

// ── Sanity-projected types (match GROQ query shapes) ──────────────────────

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export interface SanityCategory {
  _id: string;
  name: string;
  slug: string;
  color?: string;
}

export interface SanityAuthor {
  _id: string;
  name: string;
  slug: string;
  bio?: string;
  avatarUrl?: string;
}

/** Shape returned by articleCardFragment + detail query */
export interface SanityArticle {
  _id: string;
  title: string;
  subtitle?: string;
  slug: string;
  excerpt: string;
  publishedAt?: string;
  featured: boolean;
  access_tier?: ArticleAccessTier;
  coverImageUrl?: string;
  category: SanityCategory;
  tags?: SanityCategory[];
  author?: SanityAuthor;
  // Only present on detail query
  content?: SanityBlock[];
  seoTitle?: string;
  seoDescription?: string;
}

// Portable Text block — requires _type to satisfy @portabletext/react's TypedObject
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SanityBlock = { _type: string; [key: string]: any };

// ── Bridge hand types ──────────────────────────────────────────────────────

export interface BridgeHandData {
  _key: string;
  _type: "bridgeHand";
  title?: string;
  dealer?: "North" | "East" | "South" | "West";
  vulnerability?: "none" | "ns" | "ew" | "all";
  north?: string;
  east?: string;
  south?: string;
  west?: string;
  auction?: string[];
  contract?: string;
  lead?: string;
  notes?: string;
}

export interface BidTableData {
  _key: string;
  _type: "bidTable";
  title?: string;
  bids?: string[];
  notes?: string;
}

// ── Supabase content block types ──────────────────────────────────────────

export type Direction = "north" | "south" | "east" | "west";

export interface HandCards {
  S: string;
  H: string;
  D: string;
  C: string;
}

export type TextBlock = {
  id: string;
  type: "text";
  data: { text: string };
};

export type BridgeHandBlock = {
  id: string;
  type: "bridgeHand";
  data: {
    hands: Record<Direction, HandCards>;
    visibleHands: Record<Direction, boolean>;
    dealer: string;
    vulnerability: string;
    contract: string;
    lead: string;
    title: string;
  };
};

export type PlayHandBlock = {
  id: string;
  type: "playHand";
  data: {
    title?: string;
    /** "North" | "South" | "East" | "West" — same as BridgeHandBlock */
    dealer: string;
    vulnerability: string;
    /** Display-form contract, e.g. "3♠" or "3♠ Dbl" */
    contract: string;
    /** Seat code of the declarer: "N" | "E" | "S" | "W" */
    declarer: string;
    /** Display-form opening lead, e.g. "♥J". Shown in the UI header. */
    lead?: string;
    /** Structured opening lead used by the game engine to pre-play the AI's first card. */
    openingLead?: { suit: string; rank: string };
    hands: Record<Direction, HandCards>;
    visibleHands: Record<Direction, boolean>;
    /** Auction embedded in the block (shown in the overlay). */
    auction?: {
      dealer: string;
      bids: Array<{ text: string; alert: string | null }>;
    };
  };
};

export type BiddingTableBlock = {
  id: string;
  type: "biddingTable";
  data: {
    dealer: string;
    bids: Array<{ text: string; alert: string | null }>;
  };
};

export type ImageBlock = {
  id: string;
  type: "image";
  data: { url: string; caption: string };
};

export type VideoBlock = {
  id: string;
  type: "video";
  data: { url: string; caption: string };
};

export type ContentBlock =
  | TextBlock
  | BridgeHandBlock
  | PlayHandBlock
  | BiddingTableBlock
  | ImageBlock
  | VideoBlock;

// ── Supabase article ───────────────────────────────────────────────────────

export interface SupabaseArticle {
  id:                string;
  title:             string;
  slug:              string;
  author_name:       string | null;
  author_id:         string | null;
  category:          string | null;
  tags:              string[];
  access_tier:       ArticleAccessTier;
  excerpt:           string | null;
  status:            "draft" | "submitted" | "published";
  content_blocks:    ContentBlock[];
  featured_image_url: string | null;
  created_at:        string;
  updated_at:        string;
  published_at:      string | null;
}

// ── Legacy / Issue types ───────────────────────────────────────────────────

export interface Issue {
  id: string;
  slug: string;
  title: string;
  volume: number;
  number: number;
  publishedAt: string;
  coverImageUrl?: string;
  articles: SanityArticle[];
}
