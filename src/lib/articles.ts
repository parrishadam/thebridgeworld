/**
 * Server-side helpers for Supabase articles.
 * Never import this file in a Client Component.
 */
import { getSupabaseAdmin } from "./supabase";
import type { SupabaseArticle, SanityArticle, SanityCategory, ArticleAccessTier } from "@/types";

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

export async function getPublishedSupabaseArticlesPaginated(options: {
  page?: number;
  limit?: number;
  category?: string;
}): Promise<{ articles: SupabaseArticle[]; total: number }> {
  const { page = 1, limit = 15, category } = options;
  const supabase = getSupabaseAdmin();
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("articles")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(from, to);

  if (category) {
    // Convert URL slug back to a pattern for case-insensitive matching
    // e.g. "bidding-systems" → ilike "bidding systems"
    query = query.ilike("category", category.replace(/-/g, " "));
  }

  const { data, count, error } = await query;
  if (error || !data) return { articles: [], total: 0 };
  return { articles: data as SupabaseArticle[], total: count ?? 0 };
}

// ── Shape adapter ─────────────────────────────────────────────────────────

/**
 * Maps a SupabaseArticle to the SanityArticle card shape so ArticleCard
 * can render Supabase articles without any changes.
 */
export function mapSupabaseToCardShape(article: SupabaseArticle): SanityArticle {
  const catName  = article.category ?? "Uncategorized";
  const catSlug  = slugify(catName);

  const category: SanityCategory = {
    _id:   catSlug,
    name:  catName,
    slug:  catSlug,
    color: "stone",
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
    coverImageUrl: article.featured_image_url ?? undefined,
    category,
    tags,
    author: article.author_name
      ? {
          _id:  article.author_id ?? slugify(article.author_name),
          name: article.author_name,
          slug: slugify(article.author_name),
        }
      : undefined,
  };
}
