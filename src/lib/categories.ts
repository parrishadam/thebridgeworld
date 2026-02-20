/**
 * Server-side helpers for the categories table.
 * Never import this file in a Client Component.
 */
import { getSupabaseAdmin } from "./supabase";
import type { Category } from "@/types";

export interface CategoryWithCount extends Category {
  article_count: number;
}

export async function getAllCategories(): Promise<Category[]> {
  const { data } = await getSupabaseAdmin()
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as Category[];
}

export async function getCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const [categories, articles] = await Promise.all([
    getSupabaseAdmin()
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true }),
    getSupabaseAdmin()
      .from("articles")
      .select("category"),
  ]);

  const countMap: Record<string, number> = {};
  for (const a of articles.data ?? []) {
    if (a.category) countMap[a.category] = (countMap[a.category] ?? 0) + 1;
  }

  return ((categories.data ?? []) as Category[]).map((c) => ({
    ...c,
    article_count: countMap[c.name] ?? 0,
  }));
}

export async function getCategoryByName(name: string): Promise<Category | null> {
  const { data } = await getSupabaseAdmin()
    .from("categories")
    .select("*")
    .eq("name", name)
    .single();
  return data ?? null;
}

export function buildCategoryMap(categories: Category[]): Record<string, Category> {
  const map: Record<string, Category> = {};
  for (const c of categories) map[c.name] = c;
  return map;
}
