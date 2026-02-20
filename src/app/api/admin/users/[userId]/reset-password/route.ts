import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateProfile } from "@/lib/subscription";

function generateTempPassword(): string {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const lower  = "abcdefghjkmnpqrstuvwxyz";
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const parts = [pick(upper, 4), pick(digits, 4), pick(lower, 4)];
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join("-");
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const { userId: callerId } = await auth();
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const caller = await getOrCreateProfile(callerId);
  if (!caller.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const newTempPassword = generateTempPassword();

  const clerk = await clerkClient();
  try {
    await clerk.users.updateUser(params.userId, {
      password:           newTempPassword,
      skipPasswordChecks: true,
    });
  } catch (err: unknown) {
    const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
      ?? (err instanceof Error ? err.message : "Failed to reset password");
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  return NextResponse.json({ tempPassword: newTempPassword });
}
