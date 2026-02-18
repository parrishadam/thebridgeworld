import { groq } from "next-sanity";
import { client } from "./sanity";
import type { SanityArticle, SanityAuthor } from "@/types";

// ── Fragment projections ───────────────────────────────────────────────────

const categoryFragment = groq`
  category-> {
    _id,
    name,
    "slug": slug.current,
    color
  }
`;

const authorFragment = groq`
  author-> {
    _id,
    name,
    "slug": slug.current,
    bio,
    "avatarUrl": photo.asset->url
  }
`;

const articleCardFragment = groq`
  _id,
  title,
  subtitle,
  "slug": slug.current,
  excerpt,
  publishedAt,
  featured,
  access_tier,
  "coverImageUrl": featuredImage.asset->url,
  tags[]-> { _id, name, "slug": slug.current, color },
  ${categoryFragment},
  ${authorFragment}
`;

// ── Queries ────────────────────────────────────────────────────────────────

/** Fetch all articles, newest first. */
export const articlesQuery = groq`
  *[_type == "article"] | order(publishedAt desc) {
    ${articleCardFragment}
  }
`;

/** Fetch the N most recent articles. */
export const recentArticlesQuery = groq`
  *[_type == "article"] | order(publishedAt desc) [0...$limit] {
    ${articleCardFragment}
  }
`;

/** Fetch the single featured article for the homepage hero. */
export const featuredArticleQuery = groq`
  *[_type == "article" && featured == true] | order(publishedAt desc) [0] {
    ${articleCardFragment}
  }
`;

/** Fetch articles by category slug. */
export const articlesByCategoryQuery = groq`
  *[_type == "article" && category->slug.current == $categorySlug]
    | order(publishedAt desc) {
      ${articleCardFragment}
    }
`;

/** Fetch a single article by slug (including full body content). */
export const articleBySlugQuery = groq`
  *[_type == "article" && slug.current == $slug][0] {
    ${articleCardFragment},
    content,
    seoTitle,
    seoDescription
  }
`;

/** Fetch all article slugs (for generateStaticParams). */
export const articleSlugsQuery = groq`
  *[_type == "article" && defined(slug.current)] {
    "slug": slug.current
  }
`;

/** Fetch all authors. */
export const authorsQuery = groq`
  *[_type == "author"] | order(name asc) {
    _id,
    name,
    "slug": slug.current,
    bio,
    "avatarUrl": photo.asset->url
  }
`;

/** Fetch all categories. */
export const categoriesQuery = groq`
  *[_type == "category"] | order(name asc) {
    _id,
    name,
    "slug": slug.current,
    description,
    color
  }
`;

// ── Typed fetch helpers ────────────────────────────────────────────────────

export async function getArticles(): Promise<SanityArticle[]> {
  return client.fetch(articlesQuery);
}

export async function getRecentArticles(limit = 6): Promise<SanityArticle[]> {
  return client.fetch(recentArticlesQuery, { limit });
}

export async function getFeaturedArticle(): Promise<SanityArticle | null> {
  return client.fetch(featuredArticleQuery);
}

export async function getArticleBySlug(slug: string): Promise<SanityArticle | null> {
  return client.fetch(articleBySlugQuery, { slug });
}

export async function getArticlesByCategory(categorySlug: string): Promise<SanityArticle[]> {
  return client.fetch(articlesByCategoryQuery, { categorySlug });
}

export async function getArticleSlugs(): Promise<{ slug: string }[]> {
  return client.fetch(articleSlugsQuery);
}

export async function getAuthors(): Promise<SanityAuthor[]> {
  return client.fetch(authorsQuery);
}
