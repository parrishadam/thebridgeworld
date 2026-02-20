import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

const VALID_SORT_COLUMNS = [
  "created_at", "title", "author_name", "category", "status", "access_tier",
] as const;
type SortColumn = typeof VALID_SORT_COLUMNS[number];

// ── GET /api/articles ──────────────────────────────────────────────────────
// Admin: returns all articles. Contributor: returns own articles only.
// Query params: page (default 1), limit (default 15), sortBy, sortOrder

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_contributor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "15", 10)));
  const rawSort = searchParams.get("sortBy") ?? "created_at";
  const sortBy: SortColumn = (VALID_SORT_COLUMNS as readonly string[]).includes(rawSort)
    ? rawSort as SortColumn
    : "created_at";
  const ascending = searchParams.get("sortOrder") === "asc";

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("articles")
    .select("*", { count: "exact" })
    .order(sortBy, { ascending })
    .range(from, to);

  if (!profile.is_admin) {
    query = query.eq("author_id", userId);
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}

// ── POST /api/articles ─────────────────────────────────────────────────────
// Creates a new article. Admin or contributor only.

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_contributor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    slug,
    author_name,
    category,
    tags,
    access_tier,
    excerpt,
    status,
    content_blocks,
    featured_image_url,
  } = body as Record<string, unknown>;

  // Contributors can only set draft or review, not published
  const resolvedStatus =
    !profile.is_admin && status === "published" ? "draft" : (status ?? "draft");

  const published_at =
    resolvedStatus === "published" ? new Date().toISOString() : null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .insert({
      title:              title ?? "",
      slug:               slug ?? "",
      author_name:        author_name ?? null,
      author_id:          userId,
      category:           category ?? null,
      tags:               tags ?? [],
      access_tier:        access_tier ?? "free",
      excerpt:            excerpt ?? null,
      status:             resolvedStatus,
      content_blocks:     content_blocks ?? [],
      featured_image_url: featured_image_url ?? null,
      published_at,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
