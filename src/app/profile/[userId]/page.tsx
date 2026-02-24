import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { clerkClient } from "@clerk/nextjs/server";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SKILL_LABELS: Record<string, string> = {
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
  expert:       "Expert",
  world_class:  "World Class",
};

// ── Helpers ────────────────────────────────────────────────────────────────

interface PublicProfile {
  user_id:      string;
  display_name: string | null;
  first_name:   string | null;
  last_name:    string | null;
  is_legacy:    boolean;
  bio:          string | null;
  photo_url:    string | null;
  skill_level:  string | null;
  location:     string | null;
  created_at:   string;
}

async function fetchProfile(userId: string): Promise<PublicProfile | null> {
  const { data } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("user_id, display_name, first_name, last_name, is_legacy, bio, photo_url, skill_level, location, created_at")
    .eq("user_id", userId)
    .single();
  return (data as PublicProfile) ?? null;
}

async function resolveName(profile: PublicProfile): Promise<string> {
  if (profile.display_name) return profile.display_name;
  const dbName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  if (dbName) return dbName;
  if (profile.is_legacy) return "Bridge Player";
  try {
    const clerk = await clerkClient();
    const u = await clerk.users.getUser(profile.user_id);
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || "Bridge Player";
  } catch {
    return "Bridge Player";
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { userId: string } },
): Promise<Metadata> {
  const profile = await fetchProfile(params.userId);
  if (!profile) return {};
  const name = await resolveName(profile);
  return { title: `${name} — The Bridge World` };
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  const profile = await fetchProfile(params.userId);
  if (!profile) notFound();

  const name = await resolveName(profile);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">

        {/* Avatar + name */}
        <div className="flex flex-col items-center text-center mb-10">
          {profile.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo_url}
              alt={name}
              className="w-24 h-24 rounded-full object-cover bg-stone-200 mb-4"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif text-2xl font-bold mb-4">
              {initials}
            </div>
          )}
          <h1 className="font-serif text-3xl font-bold text-stone-900">{name}</h1>
          <div className="flex items-center gap-3 mt-2">
            {profile.skill_level && (
              <span className="font-sans text-sm text-stone-500">
                {SKILL_LABELS[profile.skill_level] ?? profile.skill_level}
              </span>
            )}
            {profile.skill_level && profile.location && (
              <span className="text-stone-300">·</span>
            )}
            {profile.location && (
              <span className="font-sans text-sm text-stone-400">{profile.location}</span>
            )}
          </div>
          <p className="font-sans text-xs uppercase tracking-wide text-stone-400 mt-2">
            Member since{" "}
            {new Date(profile.created_at).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Bio */}
        {profile.bio && (
          <section className="border-t border-stone-200 pt-8">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500 mb-4">
              About
            </h2>
            <p className="font-sans text-stone-600 leading-relaxed whitespace-pre-line">
              {profile.bio}
            </p>
          </section>
        )}

      </main>
      <Footer />
    </>
  );
}
