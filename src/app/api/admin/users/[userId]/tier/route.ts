import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";
import type { SubscriptionTier } from "@/types";

const VALID_TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { userId: callerId } = await auth();
  if (!callerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const caller = await getOrCreateProfile(callerId);
  if (!caller.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { tier } = body as { tier?: SubscriptionTier };

  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: `tier must be one of: ${VALID_TIERS.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update({ tier })
    .eq("user_id", params.userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
