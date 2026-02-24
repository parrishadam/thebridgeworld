/**
 * Subscription helpers — server-side only.
 * Never import this file in a Client Component.
 */
import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "./supabase";
import type { SubscriptionStatus, SubscriptionTier, UserProfile } from "@/types";

// ── Profile ────────────────────────────────────────────────────────────────

/**
 * Returns the user's profile, creating it (with free tier defaults)
 * if it doesn't exist yet. Populates display_name, email, first_name,
 * and last_name from Clerk on first creation.
 */
export async function getOrCreateProfile(userId: string): Promise<UserProfile> {
  const supabaseAdmin = getSupabaseAdmin();

  // Build initial profile data, enriching with Clerk info when available
  const insert: Record<string, unknown> = { user_id: userId };
  try {
    const clerkUser = await currentUser();
    if (clerkUser && clerkUser.id === userId) {
      const firstName = clerkUser.firstName ?? null;
      const lastName = clerkUser.lastName ?? null;
      insert.first_name = firstName;
      insert.last_name = lastName;
      insert.display_name = [firstName, lastName].filter(Boolean).join(" ") || null;
      insert.email = clerkUser.emailAddresses[0]?.emailAddress ?? null;
    }
  } catch {
    // Clerk context may not be available (e.g. in background jobs) — skip enrichment
  }

  await supabaseAdmin
    .from("user_profiles")
    .upsert(insert, { onConflict: "user_id", ignoreDuplicates: true });

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
    isAuthor:      (profile.is_author ?? false) || profile.is_admin,
  };
}
