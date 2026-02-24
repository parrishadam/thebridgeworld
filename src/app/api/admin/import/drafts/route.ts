import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/admin/import/drafts?year=YYYY&month=MM
// Returns draft articles for a given issue (by year/month).

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getOrCreateProfile(userId);
    if (!profile.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "0");
    const month = parseInt(searchParams.get("month") || "0");

    if (!year || !month) {
      return NextResponse.json({ error: "year and month required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Find the issue by slug pattern
    const issueSlug = `${year}-${String(month).padStart(2, "0")}`;

    const { data: issue } = await supabase
      .from("issues")
      .select("id")
      .eq("slug", issueSlug)
      .single();

    if (!issue) {
      return NextResponse.json({ articles: [] });
    }

    const { data: articles, error } = await supabase
      .from("articles")
      .select("id, title, slug, author_name, category, tags, excerpt, content_blocks, source_page, status")
      .eq("issue_id", issue.id)
      .eq("status", "draft")
      .order("source_page", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ articles: articles || [] });
  } catch (err) {
    console.error("[import/drafts] Error:", err);
    return NextResponse.json(
      { error: `Failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
