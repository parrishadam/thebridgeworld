/**
 * Builds the author dropdown list for the editor.
 * Combines live Clerk users (is_admin OR is_author) with legacy archive authors.
 * Server-side only.
 */
import { getSupabaseAdmin } from "./supabase";

export interface AuthorEntry {
  id:       string;
  name:     string;
  email:    string;
  isLegacy: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildAuthorList(clerk: any): Promise<AuthorEntry[]> {
  const { data: profiles } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("user_id, first_name, last_name, is_legacy")
    .or("is_admin.eq.true,is_author.eq.true");

  if (!profiles || profiles.length === 0) return [];

  const legacyProfiles = profiles.filter((p: { is_legacy: boolean }) => p.is_legacy);
  const clerkIds       = profiles
    .filter((p: { is_legacy: boolean }) => !p.is_legacy)
    .map((p: { user_id: string }) => p.user_id);

  const clerkEntries: AuthorEntry[] = [];
  if (clerkIds.length > 0) {
    const { data: clerkList } = await clerk.users.getUserList({ userId: clerkIds, limit: 200 });
    for (const u of clerkList ?? []) {
      clerkEntries.push({
        id:       u.id,
        name:     [u.firstName, u.lastName].filter(Boolean).join(" ") || "—",
        email:    u.emailAddresses[0]?.emailAddress ?? "—",
        isLegacy: false,
      });
    }
  }

  const legacyEntries: AuthorEntry[] = legacyProfiles.map((p: {
    user_id: string; first_name: string | null; last_name: string | null;
  }) => ({
    id:       p.user_id,
    name:     [p.first_name, p.last_name].filter(Boolean).join(" ") || "—",
    email:    "—",
    isLegacy: true,
  }));

  return [...clerkEntries, ...legacyEntries];
}
