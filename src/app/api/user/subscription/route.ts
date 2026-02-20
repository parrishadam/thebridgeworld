import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getSubscriptionStatus(userId);
    return NextResponse.json({
      tier:          status.tier,
      isAdmin:       status.isAdmin,
      isContributor: status.isContributor,
      isAuthor:      status.isAuthor,
    });
  } catch (err) {
    console.error("[/api/user/subscription]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
