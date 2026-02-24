import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

// POST /api/admin/import/issue — Create or find an issue record

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, slug, month, year, volume, number } = body as {
    title: string;
    slug: string;
    month: number;
    year: number;
    volume: number | null;
    number: number | null;
  };

  if (!title || !slug || !month || !year) {
    return NextResponse.json(
      { error: "Missing required fields: title, slug, month, year" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Try to find existing issue by slug
  const { data: existing } = await supabase
    .from("issues")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    return NextResponse.json({ id: existing.id, created: false });
  }

  // Create new issue
  const { data, error } = await supabase
    .from("issues")
    .insert({
      title,
      slug,
      month,
      year,
      volume: volume || null,
      number: number || null,
      published_at: new Date(year, month - 1, 1).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, created: true }, { status: 201 });
}
