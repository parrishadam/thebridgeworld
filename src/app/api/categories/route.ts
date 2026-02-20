import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";
import { getCategoriesWithCounts } from "@/lib/categories";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── GET /api/categories ────────────────────────────────────────────────────
// Public. Returns all categories sorted by sort_order, with article counts.

export async function GET() {
  try {
    const categories = await getCategoriesWithCounts();
    return NextResponse.json(categories);
  } catch (err) {
    console.error("[GET /api/categories]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/categories ───────────────────────────────────────────────────
// Admin only. Creates a new category.

export async function POST(request: NextRequest) {
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
    .insert({
      name:        name.trim(),
      slug:        slugify(name.trim()),
      description: description?.trim() || null,
      color:       color?.trim()       || null,
      sort_order:  sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505"
      ? "A category with that name already exists"
      : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json(data, { status: 201 });
}
