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
  const isOwner = data.author_id === userId ||
    (Array.isArray(data.author_ids) && data.author_ids.includes(userId));
  if (!profile.is_admin && !isOwner) {
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
    .select("id, author_id, author_ids, status, published_at, featured_image_url")
    .eq("id", params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = existing.author_id === userId ||
    (Array.isArray(existing.author_ids) && existing.author_ids.includes(userId));
  if (!profile.is_admin && !isOwner) {
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
    author_ids: bodyAuthorIds,
    category,
    tags,
    access_tier,
    level,
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

  // Admins can set author_id to a specific user, or explicitly to null.
  // Use a sentinel to distinguish "not provided" from "set to null".
  const resolvedAuthorId: string | null | undefined =
    profile.is_admin && authorId === null
      ? null
      : (profile.is_admin && typeof authorId === "string" && authorId ? authorId : undefined);

  // Authors cannot change access_tier; fetch existing value to preserve it
  const resolvedAccessTier = profile.is_admin ? (access_tier ?? "free") : undefined;

  // Denormalize author photo (use new authorId if set, else existing)
  const finalAuthorId = resolvedAuthorId !== undefined ? resolvedAuthorId : existing.author_id;
  let author_photo_url: string | null = null;
  if (finalAuthorId) {
    const { data: authorProfile } = await supabase
      .from("user_profiles")
      .select("photo_url")
      .eq("user_id", finalAuthorId)
      .single();
    author_photo_url = (authorProfile as { photo_url: string | null } | null)?.photo_url ?? null;
  }

  // Detect if the primary author changed — invalidate the auto-generated card image
  const authorChanged = resolvedAuthorId !== undefined && resolvedAuthorId !== existing.author_id;
  const resolvedFeaturedImageUrl = authorChanged ? null : (featured_image_url ?? null);

  // Set published_at when transitioning to published
  let published_at = existing.published_at;
  if (resolvedStatus === "published" && !existing.published_at) {
    published_at = new Date().toISOString();
  } else if (resolvedStatus !== "published") {
    published_at = null;
  }

  // Resolve author_ids: use explicit array if provided by admin, or null to clear
  const resolvedAuthorIds: string[] | null | undefined =
    profile.is_admin && Array.isArray(bodyAuthorIds)
      ? bodyAuthorIds as string[]
      : (profile.is_admin && bodyAuthorIds === null ? null : undefined);

  const { data, error } = await supabase
    .from("articles")
    .update({
      title:              title,
      slug:               slug,
      author_name:        author_name ?? null,
      ...(resolvedAuthorId !== undefined && { author_id: resolvedAuthorId }),
      ...(resolvedAuthorIds !== undefined && { author_ids: resolvedAuthorIds }),
      category:           category ?? null,
      tags:               tags ?? [],
      ...(resolvedAccessTier !== undefined && { access_tier: resolvedAccessTier }),
      level:              level ?? null,
      excerpt:            excerpt ?? null,
      status:             resolvedStatus,
      content_blocks:     content_blocks ?? [],
      featured_image_url: resolvedFeaturedImageUrl,
      author_photo_url,
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
