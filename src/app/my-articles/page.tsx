import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import MyArticlesTable from "./MyArticlesTable";
import type { SupabaseArticle } from "@/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Articles" };

const PAGE_SIZE = 15;

export default async function MyArticlesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) redirect("/");

  const { data, count } = await getSupabaseAdmin()
    .from("articles")
    .select("*", { count: "exact" })
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="border-b-2 border-stone-900 pb-2 mb-2">
          <h1 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
            Writing
          </h1>
        </div>
        <div className="flex items-start justify-between mb-8">
          <p className="font-serif text-2xl font-bold text-stone-900">My Articles</p>
          <Link
            href="/editor"
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            + New Article
          </Link>
        </div>

        <div className="bg-white border border-stone-200 rounded-sm p-6">
          <MyArticlesTable
            initialArticles={(data ?? []) as SupabaseArticle[]}
            initialTotal={count ?? 0}
            pageSize={PAGE_SIZE}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
