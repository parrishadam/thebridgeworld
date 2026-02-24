import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

// ── PUT /api/faqs/[id] ────────────────────────────────────────────────────
// Admin only. Updates an existing FAQ.

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

  // Build update payload with only provided fields
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (question !== undefined) update.question = question.trim();
  if (answer !== undefined)   update.answer = answer.trim();
  if (sort_order !== undefined) update.sort_order = sort_order;
  if (is_published !== undefined) update.is_published = is_published;

  const { data, error } = await getSupabaseAdmin()
    .from("faqs")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// ── DELETE /api/faqs/[id] ──────────────────────────────────────────────────
// Admin only. Deletes an FAQ by id.

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await getSupabaseAdmin()
    .from("faqs")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
