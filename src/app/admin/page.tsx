import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import UserTierTable from "./UserTierTable";
import { getOrCreateProfile } from "@/lib/subscription";
import { supabaseAdmin } from "@/lib/supabase";
import { clerkClient } from "@clerk/nextjs/server";

export const metadata: Metadata = { title: "Admin — User Management" };

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) redirect("/");

  // Fetch all user profiles directly (avoids server-to-server loopback)
  const { data: profiles } = await supabaseAdmin
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  // Enrich with Clerk user data
  const clerk = await clerkClient();
  const userIds = (profiles ?? []).map((p) => p.user_id);
  let clerkMap: Record<string, { name: string; email: string; imageUrl?: string }> = {};

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

  const users = (profiles ?? []).map((p) => ({
    ...p,
    ...(clerkMap[p.user_id] ?? { name: "Unknown", email: "—" }),
  }));

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
          <UserTierTable initialUsers={users} />
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
