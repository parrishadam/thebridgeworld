import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ── POST /api/auth/log-login ───────────────────────────────────────────────
// Authenticated. Records a login event with IP and user agent.

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") ?? "unknown";

  const userAgent = request.headers.get("user-agent") ?? "unknown";

  const { error } = await getSupabaseAdmin()
    .from("login_history")
    .insert({
      user_id:      userId,
      ip_address:   ip,
      logged_in_at: new Date().toISOString(),
      user_agent:   userAgent,
    });

  if (error) {
    console.error("[log-login]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
