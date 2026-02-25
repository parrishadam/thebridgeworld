import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const { userId: callerId } = await auth();
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const caller = await getOrCreateProfile(callerId);
  if (!caller.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { firstName, lastName, email, isAdmin, isAuthor, isContributor, isLegacy, bio, photoUrl } = body as {
    firstName?: string; lastName?: string; email?: string; isAdmin?: boolean; isAuthor?: boolean; isContributor?: boolean; isLegacy?: boolean; bio?: string | null; photoUrl?: string | null;
  };

  // Prevent an admin from removing their own admin status
  if (isAdmin === false && params.userId === callerId) {
    return NextResponse.json({ error: "You cannot remove your own admin status" }, { status: 403 });
  }

  // Build a partial update — only include fields that were explicitly provided
  const update: Record<string, unknown> = {};
  if (firstName !== undefined) update.first_name = firstName?.trim() || null;
  if (lastName  !== undefined) update.last_name  = lastName?.trim()  || null;
  if (email     !== undefined) update.email      = email?.trim()     || null;
  if (isAdmin       !== undefined) update.is_admin       = isAdmin;
  if (isAuthor      !== undefined) update.is_author      = isAuthor;
  if (isContributor !== undefined) update.is_contributor = isContributor;
  if (isLegacy      !== undefined) update.is_legacy      = isLegacy;
  if (bio           !== undefined) update.bio            = bio?.trim()       || null;
  if (photoUrl      !== undefined) update.photo_url      = photoUrl?.trim()  || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update(update)
    .eq("user_id", params.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
