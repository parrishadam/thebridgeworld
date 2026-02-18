import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const caller = await getOrCreateProfile(userId);
  if (!caller.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profiles, error } = await supabaseAdmin
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
