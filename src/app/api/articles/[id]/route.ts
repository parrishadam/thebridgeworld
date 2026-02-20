import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

// ── GET /api/articles/[id] ────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Non-admins can only view their own articles
  if (!profile.is_admin && data.author_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(data);
}

// ── PUT /api/articles/[id] ────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // Verify article exists and check ownership
  const { data: existing, error: fetchError } = await supabase
    .from("articles")
    .select("id, author_id, status, published_at")
    .eq("id", params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!profile.is_admin && existing.author_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Authors cannot edit published articles
  if (!profile.is_admin && existing.status === "published") {
    return NextResponse.json({ error: "Published articles cannot be edited" }, { status: 403 });
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

  // Authors cannot publish
  const resolvedStatus =
    !profile.is_admin && status === "published"
      ? existing.status
      : (status ?? existing.status);

  const resolvedAuthorId =
    profile.is_admin && typeof authorId === "string" && authorId ? authorId : undefined;

  // Set published_at when transitioning to published
  let published_at = existing.published_at;
  if (resolvedStatus === "published" && !existing.published_at) {
    published_at = new Date().toISOString();
  } else if (resolvedStatus !== "published") {
    published_at = null;
  }

  const { data, error } = await supabase
    .from("articles")
    .update({
      title:              title,
      slug:               slug,
      author_name:        author_name ?? null,
      ...(resolvedAuthorId !== undefined && { author_id: resolvedAuthorId }),
      category:           category ?? null,
      tags:               tags ?? [],
      access_tier:        access_tier ?? "free",
      excerpt:            excerpt ?? null,
      status:             resolvedStatus,
      content_blocks:     content_blocks ?? [],
      featured_image_url: featured_image_url ?? null,
      published_at,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ── DELETE /api/articles/[id] ─────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("articles").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
