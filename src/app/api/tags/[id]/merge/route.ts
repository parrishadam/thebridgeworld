import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

// ── POST /api/tags/[id]/merge ───────────────────────────────────────────────
// Admin only. Merges the source tag into targetId:
//   - Articles that have source but not target → swap source for target
//   - Articles that have both                  → remove source
//   - Deletes the source tag record

export async function POST(
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

  const targetId = body.targetId as string | undefined;
  if (!targetId) return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  if (targetId === params.id) return NextResponse.json({ error: "Cannot merge a tag into itself" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Fetch both tags
  const [{ data: source }, { data: target }] = await Promise.all([
    supabase.from("tags").select("*").eq("id", params.id).single(),
    supabase.from("tags").select("*").eq("id", targetId).single(),
  ]);

  if (!source) return NextResponse.json({ error: "Source tag not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target tag not found" }, { status: 404 });

  const sourceName = source.name as string;
  const targetName = target.name as string;

  // Fetch all articles using the source tag
  const { data: articles } = await supabase
    .from("articles")
    .select("id, tags")
    .contains("tags", [sourceName]);

  for (const article of articles ?? []) {
    const tags = article.tags as string[];
    const hasTarget = tags.includes(targetName);
    // Remove source; add target if not already present
    const newTags = tags.filter((t) => t !== sourceName);
    if (!hasTarget) newTags.push(targetName);
    await supabase.from("articles").update({ tags: newTags }).eq("id", article.id);
  }

  // Delete the source tag
  const { error } = await supabase.from("tags").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, mergedCount: articles?.length ?? 0 });
}
