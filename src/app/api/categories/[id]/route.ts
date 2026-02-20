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

// ── PUT /api/categories/[id] ───────────────────────────────────────────────

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

  const { name, description, color, sort_order } = body as {
    name?: string; description?: string; color?: string; sort_order?: number;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("categories")
    .update({
      name:        name.trim(),
      slug:        slugify(name.trim()),
      description: description?.trim() || null,
      color:       color?.trim()       || null,
      sort_order:  sort_order ?? 0,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505"
      ? "A category with that name already exists"
      : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// ── DELETE /api/categories/[id] ────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();

  // Fetch the category name first
  const { data: cat } = await supabase
    .from("categories")
    .select("name")
    .eq("id", params.id)
    .single();

  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Count articles using this category
  const { count } = await supabase
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("category", cat.name);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} article${count === 1 ? "" : "s"} use this category. Reassign them first.` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("categories").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
