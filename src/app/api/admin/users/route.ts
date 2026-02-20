import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";
import type { SubscriptionTier } from "@/types";

const VALID_TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

export async function POST(req: NextRequest) {
  const { userId: callerId } = await auth();
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const caller = await getOrCreateProfile(callerId);
  if (!caller.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { firstName, lastName, email, tier } = body as {
    firstName?: string; lastName?: string; email?: string; tier?: SubscriptionTier;
  };

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const resolvedTier: SubscriptionTier = VALID_TIERS.includes(tier!) ? tier! : "free";

  // Generate a manual user ID (not a Clerk ID)
  const userId = "manual_" + crypto.randomUUID();

  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .insert({
      user_id:    userId,
      first_name: firstName?.trim() || null,
      last_name:  lastName?.trim()  || null,
      email:      email.trim(),
      tier:       resolvedTier,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return enriched shape matching the admin table's AdminUser interface
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || "—";
  return NextResponse.json({ ...data, name, email: email.trim() }, { status: 201 });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const caller = await getOrCreateProfile(userId);
  if (!caller.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profiles, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with Clerk user data (name, email, avatar)
  const clerk = await clerkClient();
  const userIds = (profiles ?? []).map((p) => p.user_id);

  const clerkUsers: Record<string, { name: string; email: string; imageUrl?: string }> = {};

  if (userIds.length > 0) {
    const { data: clerkList } = await clerk.users.getUserList({ userId: userIds, limit: 200 });
    for (const u of clerkList ?? []) {
      clerkUsers[u.id] = {
        name:     [u.firstName, u.lastName].filter(Boolean).join(" ") || "—",
        email:    u.emailAddresses[0]?.emailAddress ?? "—",
        imageUrl: u.imageUrl,
      };
    }
  }

  const enriched = (profiles ?? []).map((p) => ({
    ...p,
    ...(clerkUsers[p.user_id] ?? { name: "Unknown", email: "—" }),
  }));

  return NextResponse.json(enriched);
}
