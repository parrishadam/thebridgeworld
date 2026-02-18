import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus, trackArticleView } from "@/lib/subscription";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { slug } = body as { slug?: string };

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // Paid/premium users don't need tracking; free users need a limit check
  const status = await getSubscriptionStatus(userId);

  if (status.tier === "free") {
    if (!status.canView) {
      return NextResponse.json({ error: "Monthly limit reached" }, { status: 403 });
    }
    await trackArticleView(userId, slug);
  }

  return NextResponse.json({ ok: true });
}
