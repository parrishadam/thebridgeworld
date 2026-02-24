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
    query = query.contains("author_ids", [userId]);
  } else if (authorIdParam) {
    query = query.contains("author_ids", [authorIdParam]);
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
    author_ids: bodyAuthorIds,
    category,
    tags,
    access_tier,
    level,
    month: bodyMonth,
    year: bodyYear,
    excerpt,
    status,
    content_blocks,
    featured_image_url,
    issue_id,
    source_page,
    published_at: customPublishedAt,
  } = body as Record<string, unknown>;

  // Authors cannot publish directly; admins can set any status
  const resolvedStatus =
    !profile.is_admin && status === "published" ? "draft" : (status ?? "draft");

  // Admins can set author_id to a specific user, or explicitly to null (e.g. imports
  // with no author). Non-admins always default to their own userId.
  const resolvedAuthorId: string | null =
    profile.is_admin
      ? (typeof authorId === "string" && authorId ? authorId : (authorId === null ? null : userId))
      : userId;

  // Authors cannot set access_tier — always defaults to "paid"
  const resolvedAccessTier = profile.is_admin ? (access_tier ?? "free") : "paid";

  const published_at =
    resolvedStatus === "published"
      ? (typeof customPublishedAt === "string" ? customPublishedAt : new Date().toISOString())
      : null;

  const supabase = getSupabaseAdmin();

  // Denormalize author photo so list queries don't need a join
  let author_photo_url: string | null = null;
  if (resolvedAuthorId) {
    const { data: authorProfile } = await supabase
      .from("user_profiles")
      .select("photo_url")
      .eq("user_id", resolvedAuthorId)
      .single();
    author_photo_url = (authorProfile as { photo_url: string | null } | null)?.photo_url ?? null;
  }

  // Resolve author_ids: use explicit array if provided, otherwise derive from author_id
  const resolvedAuthorIds: string[] | null =
    Array.isArray(bodyAuthorIds) && bodyAuthorIds.length > 0
      ? bodyAuthorIds as string[]
      : resolvedAuthorId ? [resolvedAuthorId] : null;

  const insertData: Record<string, unknown> = {
    title:              title ?? "",
    slug:               slug ?? "",
    author_name:        author_name ?? null,
    author_id:          resolvedAuthorId,
    author_ids:         resolvedAuthorIds,
    category:           category ?? null,
    tags:               tags ?? [],
    access_tier:        resolvedAccessTier,
    level:              level ?? null,
    excerpt:            excerpt ?? null,
    status:             resolvedStatus,
    content_blocks:     content_blocks ?? [],
    featured_image_url: featured_image_url ?? null,
    author_photo_url,
    published_at,
  };

  // Optional fields from import pipeline
  if (typeof issue_id === "string" && issue_id) insertData.issue_id = issue_id;
  if (typeof source_page === "number") insertData.source_page = source_page;
  if (typeof bodyMonth === "number") insertData.month = bodyMonth;
  if (typeof bodyYear === "number") insertData.year = bodyYear;

  const { data, error } = await supabase
    .from("articles")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
