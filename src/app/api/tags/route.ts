import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAllTags } from "@/lib/tags";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── GET /api/tags ───────────────────────────────────────────────────────────
// Public. Returns all tags sorted alphabetically, optional ?q= filter.

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  try {
    const tags = await getAllTags(q);
    return NextResponse.json(tags);
  } catch (err) {
    console.error("[GET /api/tags]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/tags ──────────────────────────────────────────────────────────
// Any authenticated user. Creates a new tag (or returns existing).

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name as string | undefined)?.toLowerCase().trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Return existing tag if name already taken
  const { data: existing } = await supabase
    .from("tags")
    .select("*")
    .eq("name", name)
    .single();

  if (existing) return NextResponse.json(existing, { status: 200 });

  const { data, error } = await supabase
    .from("tags")
    .insert({ name, slug: slugify(name) })
    .select()
    .single();

  if (error) {
    // Race condition: another request created it first
    if (error.code === "23505") {
      const { data: race } = await supabase.from("tags").select("*").eq("name", name).single();
      return NextResponse.json(race, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
