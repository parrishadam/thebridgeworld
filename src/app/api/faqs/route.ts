import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

// ── GET /api/faqs ──────────────────────────────────────────────────────────
// Public. Returns all published FAQs ordered by sort_order.

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("faqs")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/faqs]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/faqs ─────────────────────────────────────────────────────────
// Admin only. Creates a new FAQ.

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question, answer, sort_order, is_published } = body as {
    question?: string; answer?: string; sort_order?: number; is_published?: boolean;
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }
  if (!answer?.trim()) {
    return NextResponse.json({ error: "Answer is required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("faqs")
    .insert({
      question:     question.trim(),
      answer:       answer.trim(),
      sort_order:   sort_order ?? 0,
      is_published: is_published ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
