import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminArticlesTable from "./AdminArticlesTable";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSanityArticleCount } from "@/lib/queries";
import type { SupabaseArticle } from "@/types";

export const metadata: Metadata = { title: "Admin — Article Management" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function AdminArticlesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) redirect("/");

  // Fetch page 1 (default sort: created_at desc) and total count in parallel with Sanity count
  const [{ data: articles, count }, sanityCount] = await Promise.all([
    getSupabaseAdmin()
      .from("articles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
    getSanityArticleCount().catch(() => 0),
  ]);

  const total = count ?? 0;

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
              {total} {total === 1 ? "article" : "articles"} in Supabase
            </p>
          </div>
          <Link
            href="/editor"
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            + New Article
          </Link>
        </div>

        {/* Sanity notice */}
        {sanityCount > 0 && (
          <div className="mb-6 bg-stone-50 border border-stone-200 rounded-sm px-4 py-3 flex items-start gap-3">
            <span className="text-stone-400 mt-0.5 shrink-0">ℹ</span>
            <p className="font-sans text-sm text-stone-600">
              <span className="font-semibold">{sanityCount} {sanityCount === 1 ? "article" : "articles"}</span>
              {" "}from Sanity CMS {sanityCount === 1 ? "is" : "are"} not shown here — they are managed
              separately in the Sanity Studio and cannot be edited in this interface.
            </p>
          </div>
        )}

        <div className="bg-white border border-stone-200 rounded-sm p-6">
          <AdminArticlesTable
            initialArticles={(articles ?? []) as SupabaseArticle[]}
            initialTotal={total}
            pageSize={PAGE_SIZE}
          />
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
