import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import { clerkClient } from "@clerk/nextjs/server";
import type { SupabaseArticle } from "@/types";
import UserDetailPanel from "./UserDetailPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { userId: string };
}): Promise<Metadata> {
  return { title: `Admin — User ${params.userId}` };
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: { userId: string };
}) {
  const { userId: callerId } = await auth();
  if (!callerId) redirect("/sign-in");

  const callerProfile = await getOrCreateProfile(callerId);
  if (!callerProfile.is_admin) redirect("/");

  // Fetch user profile
  const { data: profile } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .eq("user_id", params.userId)
    .single();

  if (!profile) notFound();

  // Resolve name/email from Clerk for non-legacy users
  let clerkName = "";
  let clerkEmail = "";
  let clerkImageUrl = "";
  if (!profile.is_legacy) {
    try {
      const clerk = await clerkClient();
      const u = await clerk.users.getUser(params.userId);
      clerkName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "";
      clerkEmail = u.emailAddresses[0]?.emailAddress ?? "";
      clerkImageUrl = u.imageUrl ?? "";
    } catch {
      // Clerk user may not exist (manual accounts)
    }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    || clerkName || "—";
  const email = profile.email || clerkEmail || "—";
  const photoUrl = profile.photo_url || clerkImageUrl || "";

  // Fetch articles by this user
  const { data: articles } = await getSupabaseAdmin()
    .from("articles")
    .select("id, title, slug, category, status, published_at, month, year")
    .contains("author_ids", [params.userId])
    .order("published_at", { ascending: false });

  // Fetch all non-legacy users for merge target dropdown
  const { data: allProfiles } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("user_id, first_name, last_name, email, is_legacy")
    .eq("is_legacy", false);

  const mergeTargets = (allProfiles ?? [])
    .filter((p) => p.user_id !== params.userId)
    .map((p) => ({
      user_id: p.user_id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.user_id,
      email: p.email || "—",
    }));

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <nav className="flex items-center gap-2 text-xs font-sans text-stone-400 mb-8">
          <Link href="/admin" className="hover:text-stone-600 transition-colors">Admin</Link>
          <span>/</span>
          <span>Users</span>
          <span>/</span>
          <span className="text-stone-600">{name}</span>
        </nav>

        <UserDetailPanel
          user={{
            user_id: profile.user_id,
            name,
            email,
            photo_url: photoUrl,
            tier: profile.tier,
            is_admin: profile.is_admin,
            is_author: profile.is_author,
            is_contributor: profile.is_contributor ?? false,
            is_legacy: profile.is_legacy ?? false,
            bio: profile.bio,
            first_name: profile.first_name,
            last_name: profile.last_name,
            created_at: profile.created_at,
          }}
          articles={(articles ?? []) as Pick<SupabaseArticle, "id" | "title" | "slug" | "category" | "status" | "published_at" | "month" | "year">[]}
          mergeTargets={mergeTargets}
          currentUserId={callerId}
        />

        <div className="mt-8">
          <Link
            href="/admin"
            className="font-sans text-sm text-stone-400 hover:text-stone-700 transition-colors"
          >
            &larr; Back to Admin
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
