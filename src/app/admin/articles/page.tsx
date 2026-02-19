import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminArticlesTable from "./AdminArticlesTable";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SupabaseArticle } from "@/types";

export const metadata: Metadata = { title: "Admin — Article Management" };
export const dynamic = "force-dynamic";

export default async function AdminArticlesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) redirect("/");

  const { data: articles } = await getSupabaseAdmin()
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="border-b-2 border-stone-900 pb-2 mb-2">
          <h1 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
            Admin
          </h1>
        </div>
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="font-serif text-2xl font-bold text-stone-900">Article Management</p>
            <p className="font-sans text-sm text-stone-400 mt-1">
              {(articles ?? []).length}{" "}
              {(articles ?? []).length === 1 ? "article" : "articles"}
            </p>
          </div>
          <Link
            href="/editor"
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            + New Article
          </Link>
        </div>

        <div className="bg-white border border-stone-200 rounded-sm p-6">
          <AdminArticlesTable initialArticles={(articles ?? []) as SupabaseArticle[]} />
        </div>

        <div className="mt-6">
          <Link
            href="/admin"
            className="font-sans text-sm text-stone-400 hover:text-stone-700 transition-colors"
          >
            ← Back to Admin
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
