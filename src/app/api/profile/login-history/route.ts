import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

// ── GET /api/profile/login-history ─────────────────────────────────────────
// Authenticated. Returns login history for current user (or target user if admin).

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);

  // Admins can view any user's history via ?userId= param
  const targetParam = request.nextUrl.searchParams.get("userId");
  const targetUserId = profile.is_admin && targetParam ? targetParam : userId;

  const { data, error } = await getSupabaseAdmin()
    .from("login_history")
    .select("id, ip_address, user_agent, logged_in_at")
    .eq("user_id", targetUserId)
    .order("logged_in_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
