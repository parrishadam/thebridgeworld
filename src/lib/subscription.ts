/**
 * Subscription helpers — server-side only.
 * Never import this file in a Client Component.
 */
import { getSupabaseAdmin } from "./supabase";
import type { SubscriptionStatus, SubscriptionTier, UserProfile } from "@/types";

// ── Profile ────────────────────────────────────────────────────────────────

/**
 * Returns the user's profile, creating it (with free tier defaults)
 * if it doesn't exist yet.
 */
export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const supabaseAdmin = getSupabaseAdmin();

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
  return {
    tier:          profile.tier as SubscriptionTier,
    isAdmin:       profile.is_admin,
    isContributor: profile.is_contributor ?? false,
  };
}
