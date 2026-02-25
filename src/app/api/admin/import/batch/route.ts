import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";
import type { ContentBlock } from "@/types";

// POST /api/admin/import/batch — Bulk-create articles for an issue

interface BatchArticle {
  title: string;
  slug: string;
  author_name: string;
  category: string;
  tags: string[];
  level: string;
  month: number;
  year: number;
  source_page: number;
  excerpt: string;
  content_blocks: ContentBlock[];
  issue_id: string;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { articles: BatchArticle[]; issueId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { articles, issueId } = body;

  if (!Array.isArray(articles) || articles.length === 0 || !issueId) {
    return NextResponse.json(
      { error: "Missing required fields: articles (non-empty array), issueId" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Build rows for bulk insert
  const rows = articles.map((a) => ({
    title: a.title,
    slug: a.slug,
    author_name: a.author_name || null,
    category: a.category || null,
    tags: a.tags || [],
    level: a.level || null,
    month: a.month,
    year: a.year,
    source_page: a.source_page || null,
    excerpt: a.excerpt || null,
    content_blocks: a.content_blocks,
    issue_id: issueId,
    status: "draft" as const,
    access_tier: "paid" as const,
    published_at: new Date(a.year, a.month - 1, 1).toISOString(),
  }));

  const { data, error } = await supabase
    .from("articles")
    .insert(rows)
    .select("id, title");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { created: data.length, articles: data },
    { status: 201 },
  );
}
