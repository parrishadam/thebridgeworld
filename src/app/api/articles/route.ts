import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

const VALID_SORT_COLUMNS = [
  "created_at", "title", "author_name", "category", "status", "access_tier",
] as const;
type SortColumn = typeof VALID_SORT_COLUMNS[number];

// ── GET /api/articles ──────────────────────────────────────────────────────
// Admin: returns all articles (or filtered by authorId param).
// Author: returns own articles only.
// Query params: page (default 1), limit (default 15), sortBy, sortOrder, authorId (admin only)

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) {
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
  const authorIdParam = searchParams.get("authorId");

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
  } else if (authorIdParam) {
    query = query.eq("author_id", authorIdParam);
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}

// ── POST /api/articles ─────────────────────────────────────────────────────
// Creates a new article. Admin or author only.

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) {
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
    author_id: authorId,
    category,
    tags,
    access_tier,
    excerpt,
    status,
    content_blocks,
    featured_image_url,
  } = body as Record<string, unknown>;

  // Authors cannot publish directly; admins can set any status
  const resolvedStatus =
    !profile.is_admin && status === "published" ? "draft" : (status ?? "draft");

  const resolvedAuthorId =
    profile.is_admin && typeof authorId === "string" && authorId ? authorId : userId;

  // Authors cannot set access_tier — always defaults to "paid"
  const resolvedAccessTier = profile.is_admin ? (access_tier ?? "free") : "paid";

  const published_at =
    resolvedStatus === "published" ? new Date().toISOString() : null;

  const supabase = getSupabaseAdmin();

  // Denormalize author photo so list queries don't need a join
  const { data: authorProfile } = await supabase
    .from("user_profiles")
    .select("photo_url")
    .eq("user_id", resolvedAuthorId)
    .single();
  const author_photo_url = (authorProfile as { photo_url: string | null } | null)?.photo_url ?? null;

  const { data, error } = await supabase
    .from("articles")
    .insert({
      title:              title ?? "",
      slug:               slug ?? "",
      author_name:        author_name ?? null,
      author_id:          resolvedAuthorId,
      category:           category ?? null,
      tags:               tags ?? [],
      access_tier:        resolvedAccessTier,
      excerpt:            excerpt ?? null,
      status:             resolvedStatus,
      content_blocks:     content_blocks ?? [],
      featured_image_url: featured_image_url ?? null,
      author_photo_url,
      published_at,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
