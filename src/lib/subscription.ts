/**
 * Subscription helpers — server-side only.
 * Never import this file in a Client Component.
 */
import { supabaseAdmin } from "./supabase";
import type { SubscriptionStatus, SubscriptionTier, UserProfile } from "@/types";

const FREE_LIMIT = 3;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// ── Profile ────────────────────────────────────────────────────────────────

/**
 * Returns the user's profile, creating it (with free tier defaults)
 * if it doesn't exist yet.
 */
export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  // Upsert ensures we get a row even on first visit
  await supabaseAdmin
    .from("user_profiles")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error(`Failed to load profile for ${userId}: ${error?.message}`);
  return data as UserProfile;
}

// ── Subscription status ────────────────────────────────────────────────────

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const profile = await getOrCreateProfile(userId);

  const { count } = await supabaseAdmin
    .from("article_views")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("month", currentMonth());

  const viewCount = count ?? 0;
  const canView   = profile.tier !== "free" || viewCount < FREE_LIMIT;

  return {
    tier:      profile.tier as SubscriptionTier,
    isAdmin:   profile.is_admin,
    viewCount,
    canView,
  };
}

// ── View tracking ──────────────────────────────────────────────────────────

/**
 * Records that userId viewed articleSlug this month.
 * Idempotent — re-reading the same article does not consume another slot.
 * Errors are swallowed so tracking failures never block article reads.
 */
export async function trackArticleView(
  userId: string,
  articleSlug: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from("article_views")
      .upsert(
        { user_id: userId, article_slug: articleSlug, month: currentMonth() },
        { onConflict: "user_id,article_slug,month", ignoreDuplicates: true }
      );
  } catch (err) {
    console.error("[trackArticleView] non-fatal error:", err);
  }
}
