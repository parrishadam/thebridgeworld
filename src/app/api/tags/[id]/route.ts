import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── PUT /api/tags/[id] ──────────────────────────────────────────────────────
// Admin only. Renames the tag and updates all articles using the old name.

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newName = (body.name as string | undefined)?.toLowerCase().trim();
  if (!newName) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Fetch current tag
  const { data: existing } = await supabase
    .from("tags")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oldName = existing.name as string;
  if (oldName === newName) return NextResponse.json(existing);

  // Update tag record
  const { data: updated, error } = await supabase
    .from("tags")
    .update({ name: newName, slug: slugify(newName) })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "A tag with that name already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Update all articles that use the old tag name
  const { data: articles } = await supabase
    .from("articles")
    .select("id, tags")
    .contains("tags", [oldName]);

  for (const article of articles ?? []) {
    const newTags = (article.tags as string[]).map((t) =>
      t === oldName ? newName : t
    );
    await supabase.from("articles").update({ tags: newTags }).eq("id", article.id);
  }

  return NextResponse.json(updated);
}

// ── DELETE /api/tags/[id] ───────────────────────────────────────────────────
// Admin only. Removes the tag from all articles, then deletes the tag record.

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();

  const { data: tag } = await supabase
    .from("tags")
    .select("name")
    .eq("id", params.id)
    .single();

  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tagName = tag.name as string;

  // Remove tag from all articles
  const { data: articles } = await supabase
    .from("articles")
    .select("id, tags")
    .contains("tags", [tagName]);

  for (const article of articles ?? []) {
    const newTags = (article.tags as string[]).filter((t) => t !== tagName);
    await supabase.from("articles").update({ tags: newTags }).eq("id", article.id);
  }

  // Delete the tag record
  const { error } = await supabase.from("tags").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
