import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateProfile } from "@/lib/subscription";

const VALID_SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert", "world_class"];

// ── GET /api/profile ───────────────────────────────────────────────────────
// Authenticated. Returns the current user's full profile.

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const profile = await getOrCreateProfile(userId);
    return NextResponse.json(profile);
  } catch (err) {
    console.error("[GET /api/profile]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PUT /api/profile ───────────────────────────────────────────────────────
// Authenticated. Updates the current user's profile (safe fields only).
// Admins can also update display_name and target other users via target_user_id.

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(userId);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, bio, skill_level, location, display_name, target_user_id } = body as {
    email?: string; bio?: string; skill_level?: string; location?: string;
    display_name?: string; target_user_id?: string;
  };

  // Validate skill_level if provided
  if (skill_level !== undefined && skill_level !== null && !VALID_SKILL_LEVELS.includes(skill_level)) {
    return NextResponse.json(
      { error: `Invalid skill_level. Must be one of: ${VALID_SKILL_LEVELS.join(", ")}` },
      { status: 400 },
    );
  }

  // Non-admins cannot change display_name or target other users
  if (!profile.is_admin && display_name !== undefined) {
    return NextResponse.json({ error: "Only admins can update display_name" }, { status: 403 });
  }

  const targetId = profile.is_admin && target_user_id ? target_user_id : userId;

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (display_name !== undefined && profile.is_admin) update.display_name = display_name?.trim() || null;
  if (email !== undefined)        update.email = email?.trim() || null;
  if (bio !== undefined)          update.bio = bio?.trim() || null;
  if (skill_level !== undefined)  update.skill_level = skill_level || null;
  if (location !== undefined)     update.location = location?.trim() || null;

  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update(update)
    .eq("user_id", targetId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
