import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import UserTierTable from "./UserTierTable";
import CategoriesPanel from "./CategoriesPanel";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import { clerkClient } from "@clerk/nextjs/server";
import { getCategoriesWithCounts } from "@/lib/categories";

export const metadata: Metadata = { title: "Admin — User Management" };

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) redirect("/");

  // Fetch all user profiles directly (avoids server-to-server loopback)
  const { data: profiles } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  // Enrich with Clerk user data
  const clerk = await clerkClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = (profiles ?? []).map((p: any) => p.user_id);
  const clerkMap: Record<string, { name: string; email: string; imageUrl?: string }> = {};

  if (userIds.length > 0) {
    const { data: clerkList } = await clerk.users.getUserList({ userId: userIds, limit: 200 });
    for (const u of clerkList ?? []) {
      clerkMap[u.id] = {
        name:     [u.firstName, u.lastName].filter(Boolean).join(" ") || "—",
        email:    u.emailAddresses[0]?.emailAddress ?? "—",
        imageUrl: u.imageUrl,
      };
    }
  }

  const categories = await getCategoriesWithCounts();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (profiles ?? []).map((p: any) => {
    const clerkData = clerkMap[p.user_id];
    // For manual users (no Clerk record) fall back to DB columns
    const name  = clerkData?.name  || [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
    const email = clerkData?.email || p.email || "—";
    return { ...p, name, email, imageUrl: clerkData?.imageUrl };
  });

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">

        <div className="border-b-2 border-stone-900 pb-2 mb-2">
          <h1 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
            Admin
          </h1>
        </div>
        <div className="mb-8">
          <p className="font-serif text-2xl font-bold text-stone-900">User Management</p>
          <p className="font-sans text-sm text-stone-400 mt-1">
            {users.length} {users.length === 1 ? "user" : "users"} registered
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-sm p-6">
          <UserTierTable initialUsers={users} currentUserId={userId} />
        </div>

        {/* ── Article Management ──────────────────────────────────────── */}
        <div className="mt-12">
          <div className="border-b-2 border-stone-900 pb-2 mb-6">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
              Content
            </h2>
          </div>
          <div className="flex items-center justify-between mb-4">
            <p className="font-serif text-2xl font-bold text-stone-900">Article Management</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-sm p-6 flex items-center justify-between">
            <p className="font-sans text-sm text-stone-500">
              Create, edit, and publish articles using the built-in block editor.
            </p>
            <div className="flex gap-3">
              <Link
                href="/admin/articles"
                className="font-sans text-sm border border-stone-200 text-stone-700 px-4 py-2 hover:bg-stone-50 transition-colors"
              >
                Manage Articles
              </Link>
              <Link
                href="/editor"
                className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
              >
                + New Article
              </Link>
            </div>
          </div>
        </div>

        {/* ── Categories ──────────────────────────────────────────────── */}
        <div className="mt-12">
          <div className="border-b-2 border-stone-900 pb-2 mb-6">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
              Taxonomy
            </h2>
          </div>
          <p className="font-serif text-2xl font-bold text-stone-900 mb-6">Categories</p>
          <div className="bg-white border border-stone-200 rounded-sm p-6">
            <CategoriesPanel initialCategories={categories} />
          </div>
        </div>

        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-sm p-4">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
            To make yourself an admin
          </p>
          <p className="font-sans text-sm text-amber-700">
            Run this in the Supabase SQL editor:{" "}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">
              UPDATE user_profiles SET is_admin = true WHERE user_id = &apos;{userId}&apos;;
            </code>
          </p>
        </div>

      </main>
      <Footer />
    </>
  );
}
