// ── Subscription types ─────────────────────────────────────────────────────

export type SubscriptionTier = "free" | "paid" | "premium";
export type ArticleAccessTier = "free" | "paid" | "premium";

export interface UserProfile {
  user_id:    string;
  tier:       SubscriptionTier;
  is_admin:   boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionStatus {
  tier:    SubscriptionTier;
  isAdmin: boolean;
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
