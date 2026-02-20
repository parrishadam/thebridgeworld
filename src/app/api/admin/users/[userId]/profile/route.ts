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
  const { firstName, lastName, email } = body as {
    firstName?: string; lastName?: string; email?: string;
  };

  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update({
      first_name: firstName?.trim() ?? null,
      last_name:  lastName?.trim()  ?? null,
      email:      email?.trim()     ?? null,
    })
    .eq("user_id", params.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
