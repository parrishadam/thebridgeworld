/**
 * Server-side helpers for the tags table.
 * Never import this file in a Client Component.
 */
import { getSupabaseAdmin } from "./supabase";
import type { Tag } from "@/types";

export interface TagWithCount extends Tag {
  article_count: number;
}

export async function getAllTags(q?: string): Promise<Tag[]> {
  let query = getSupabaseAdmin()
    .from("tags")
    .select("*")
    .order("name", { ascending: true });

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data } = await query;
  return (data ?? []) as Tag[];
}

export async function getTagsWithCounts(): Promise<TagWithCount[]> {
  const [tags, articles] = await Promise.all([
    getSupabaseAdmin()
      .from("tags")
      .select("*")
      .order("name", { ascending: true }),
    getSupabaseAdmin()
      .from("articles")
      .select("tags"),
  ]);

  const countMap: Record<string, number> = {};
  for (const a of articles.data ?? []) {
    for (const t of (a.tags as string[] | null) ?? []) {
      if (t) countMap[t] = (countMap[t] ?? 0) + 1;
    }
  }

  return ((tags.data ?? []) as Tag[]).map((t) => ({
    ...t,
    article_count: countMap[t.name] ?? 0,
  }));
}
