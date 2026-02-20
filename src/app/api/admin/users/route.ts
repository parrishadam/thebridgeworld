import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";
import type { SubscriptionTier } from "@/types";

const VALID_TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

/** Generate a random temporary password: 4 uppercase + 4 digits + 4 lowercase. */
function generateTempPassword(): string {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const lower  = "abcdefghjkmnpqrstuvwxyz";
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  // Shuffle the three segments so they're not always in the same block order
  const parts = [pick(upper, 4), pick(digits, 4), pick(lower, 4)];
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join("-");
}

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
  const tempPassword = generateTempPassword();

  // 1. Create the user in Clerk
  const clerk = await clerkClient();
  let clerkUser;
  try {
    clerkUser = await clerk.users.createUser({
      firstName:         firstName?.trim() || undefined,
      lastName:          lastName?.trim()  || undefined,
      emailAddress:      [email.trim()],
      password:          tempPassword,
      skipPasswordChecks: true,
    });
  } catch (err: unknown) {
    const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
      ?? (err instanceof Error ? err.message : "Failed to create Clerk user");
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // 2. Create the matching user_profiles row in Supabase
  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .insert({
      user_id:    clerkUser.id,
      first_name: firstName?.trim() || null,
      last_name:  lastName?.trim()  || null,
      email:      email.trim(),
      tier:       resolvedTier,
    })
    .select()
    .single();

  if (error) {
    // Roll back the Clerk user so we don't leave orphans
    await clerk.users.deleteUser(clerkUser.id).catch(() => null);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || "—";
  return NextResponse.json(
    { ...data, name, email: email.trim(), tempPassword },
    { status: 201 },
  );
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
