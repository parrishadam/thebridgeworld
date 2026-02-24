import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/admin/users/merge
 * Merges a legacy author into a real user:
 *  - Updates all articles with author_id = legacyUserId to targetUserId
 *  - Optionally deletes the legacy profile
 *
 * Body: { legacyUserId: string, targetUserId: string }
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { legacyUserId?: string; targetUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { legacyUserId, targetUserId } = body;
  if (!legacyUserId || !targetUserId) {
    return NextResponse.json(
      { error: "Both legacyUserId and targetUserId are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify the legacy user exists and is actually legacy
  const { data: legacyProfile } = await supabase
    .from("user_profiles")
    .select("user_id, is_legacy, display_name")
    .eq("user_id", legacyUserId)
    .single();

  if (!legacyProfile) {
    return NextResponse.json({ error: "Legacy user not found" }, { status: 404 });
  }

  if (!legacyProfile.is_legacy) {
    return NextResponse.json(
      { error: "Source user is not a legacy profile" },
      { status: 400 },
    );
  }

  // Verify the target user exists
  const { data: targetProfile } = await supabase
    .from("user_profiles")
    .select("user_id, display_name")
    .eq("user_id", targetUserId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  // Find all articles that reference the legacy user in author_ids
  const { data: affectedArticles, error: fetchArticlesError } = await supabase
    .from("articles")
    .select("id, author_id, author_ids")
    .contains("author_ids", [legacyUserId]);

  if (fetchArticlesError) {
    return NextResponse.json(
      { error: `Failed to fetch articles: ${fetchArticlesError.message}` },
      { status: 500 },
    );
  }

  const articleCount = affectedArticles?.length ?? 0;

  // Update each article: replace legacyUserId with targetUserId in author_ids,
  // and update author_id if it matches
  for (const article of affectedArticles ?? []) {
    const newAuthorIds = (article.author_ids as string[] ?? []).map(
      (id: string) => id === legacyUserId ? targetUserId : id,
    );
    const newAuthorId = article.author_id === legacyUserId
      ? targetUserId
      : article.author_id;

    const { error: updateError } = await supabase
      .from("articles")
      .update({ author_id: newAuthorId, author_ids: newAuthorIds })
      .eq("id", article.id);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update article ${article.id}: ${updateError.message}` },
        { status: 500 },
      );
    }
  }

  // Delete the legacy profile
  const { error: deleteError } = await supabase
    .from("user_profiles")
    .delete()
    .eq("user_id", legacyUserId);

  if (deleteError) {
    // Articles were updated but profile wasn't deleted — partial success
    return NextResponse.json({
      merged: articleCount,
      legacyDeleted: false,
      warning: `Articles merged but legacy profile not deleted: ${deleteError.message}`,
    });
  }

  return NextResponse.json({
    merged: articleCount,
    legacyDeleted: true,
    legacyName: legacyProfile.display_name,
    targetName: targetProfile.display_name,
  });
}
