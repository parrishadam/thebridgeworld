/**
 * Server-side helpers for Supabase articles.
 * Never import this file in a Client Component.
 */
import { getSupabaseAdmin } from "./supabase";
import type {
  SupabaseArticle, SanityArticle, SanityCategory, ArticleAccessTier, Category,
  ContentBlock, BridgeHandBlock, PlayHandBlock, HandSummary,
} from "@/types";

// ── Slug helper ────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Fetchers ───────────────────────────────────────────────────────────────

export async function getSupabaseArticleBySlug(
  slug: string
): Promise<SupabaseArticle | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data as SupabaseArticle;
}

export async function getPublishedSupabaseArticles(
  limit = 10
): Promise<SupabaseArticle[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as SupabaseArticle[];
}

const SORT_COLUMN: Record<string, string> = {
  date:   "published_at",
  name:   "title",
  author: "author_name",
};

export async function getPublishedSupabaseArticlesPaginated(options: {
  page?:      number;
  limit?:     number;
  category?:  string;
  author?:    string;
  tag?:       string;
  sortBy?:    string;
  sortOrder?: string;
}): Promise<{ articles: SupabaseArticle[]; total: number }> {
  const {
    page = 1, limit = 15,
    category, author, tag,
    sortBy = "date", sortOrder = "desc",
  } = options;

  const supabase  = getSupabaseAdmin();
  const from      = (page - 1) * limit;
  const to        = from + limit - 1;
  const column    = SORT_COLUMN[sortBy] ?? "published_at";
  const ascending = sortOrder === "asc";

  let query = supabase
    .from("articles")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order(column, { ascending })
    .range(from, to);

  if (category) {
    // Support both raw names ("Bidding Systems") and URL slugs ("bidding-systems")
    query = query.ilike("category", category.replace(/-/g, " "));
  }
  if (author) {
    query = query.ilike("author_name", author);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, count, error } = await query;
  if (error || !data) return { articles: [], total: 0 };
  return { articles: data as SupabaseArticle[], total: count ?? 0 };
}

export async function getArticleFilterOptions(): Promise<{
  categories: string[];
  authors:    string[];
  tags:       string[];
}> {
  const { data } = await getSupabaseAdmin()
    .from("articles")
    .select("category, author_name, tags")
    .eq("status", "published");

  if (!data) return { categories: [], authors: [], tags: [] };

  const categories = Array.from(new Set(data.map((r) => r.category).filter(Boolean))).sort() as string[];
  const authors    = Array.from(new Set(data.map((r) => r.author_name).filter(Boolean))).sort() as string[];
  const tags       = Array.from(new Set(
    data.flatMap((r) => (Array.isArray(r.tags) ? r.tags : [])).filter(Boolean)
  )).sort() as string[];

  return { categories, authors, tags };
}

// ── Hand extractor ─────────────────────────────────────────────────────────

const SEAT_TO_DIR: Record<string, string> = {
  N: "North", S: "South", E: "East", W: "West",
};

export function extractHandData(blocks: ContentBlock[]): HandSummary | undefined {
  for (const block of blocks) {
    if (block.type !== "bridgeHand" && block.type !== "playHand") continue;

    const data = (block as BridgeHandBlock | PlayHandBlock).data;
    const south = data.hands?.south;
    if (!south) continue;

    const hand: HandSummary = {
      S:        south.S || undefined,
      H:        south.H || undefined,
      D:        south.D || undefined,
      C:        south.C || undefined,
      contract: data.contract || undefined,
    };

    if (block.type === "playHand") {
      const d = (block as PlayHandBlock).data.declarer;
      hand.declarer = SEAT_TO_DIR[d] ?? d;
    } else {
      hand.declarer = (block as BridgeHandBlock).data.dealer || undefined;
    }

    if (hand.S || hand.H || hand.D || hand.C) return hand;
  }
  return undefined;
}

// ── Shape adapter ─────────────────────────────────────────────────────────

/**
 * Maps a SupabaseArticle to the SanityArticle card shape so ArticleCard
 * can render Supabase articles without any changes.
 */
export function mapSupabaseToCardShape(
  article: SupabaseArticle,
  categoryMap?: Record<string, Category>
): SanityArticle {
  const catName  = article.category ?? "Uncategorized";
  const catSlug  = slugify(catName);
  const catColor = categoryMap?.[catName]?.color ?? undefined;

  const category: SanityCategory = {
    _id:   catSlug,
    name:  catName,
    slug:  catSlug,
    color: catColor,
  };

  const tags: SanityCategory[] = (article.tags ?? []).map((t) => ({
    _id:  slugify(t),
    name: t,
    slug: slugify(t),
  }));

  return {
    _id:          article.id,
    title:        article.title,
    slug:         article.slug,
    excerpt:      article.excerpt ?? "",
    publishedAt:  article.published_at ?? article.created_at,
    featured:     false,
    access_tier:  article.access_tier as ArticleAccessTier,
    level:        article.level ?? undefined,
    coverImageUrl: article.featured_image_url ?? undefined,
    category,
    tags,
    handData:     extractHandData(article.content_blocks ?? []),
    author: article.author_name
      ? {
          _id:      article.author_id ?? slugify(article.author_name),
          name:     article.author_name,
          slug:     slugify(article.author_name),
          avatarUrl: article.author_photo_url ?? undefined,
        }
      : undefined,
  };
}
