import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ArticleCard from "@/components/articles/ArticleCard";
import { getPublishedSupabaseArticlesPaginated, mapSupabaseToCardShape } from "@/lib/articles";

export const metadata: Metadata = { title: "Articles" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: { page?: string; category?: string };
}) {
  const page     = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const category = searchParams.category;

  const { articles, total } = await getPublishedSupabaseArticlesPaginated({
    page,
    limit: PAGE_SIZE,
    category,
  });

  const mapped     = articles.map(mapSupabaseToCardShape);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeFrom  = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo    = Math.min(page * PAGE_SIZE, total);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (category) params.set("category", category);
    const qs = params.toString();
    return `/articles${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">

        {/* ── Header ── */}
        <div className="border-b-2 border-stone-900 pb-2 mb-8 flex items-end justify-between">
          <h1 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
            Articles
          </h1>
          {total > 0 && (
            <p className="font-sans text-xs text-stone-400">
              {total} {total === 1 ? "article" : "articles"}
            </p>
          )}
        </div>

        {/* ── Active category filter ── */}
        {category && (
          <div className="mb-8 flex items-center gap-3">
            <p className="font-serif text-xl font-bold text-stone-900 capitalize">
              {category.replace(/-/g, " ")}
            </p>
            <Link
              href="/articles"
              className="font-sans text-xs text-stone-400 hover:text-stone-700 border border-stone-200 px-2 py-1 rounded transition-colors"
            >
              Clear filter
            </Link>
          </div>
        )}

        {/* ── Grid ── */}
        {mapped.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              {mapped.map((article) => (
                <ArticleCard key={article._id} article={article} />
              ))}
            </div>

            {/* ── Pagination ── */}
            <div className="flex items-center justify-between border-t border-stone-200 pt-6">
              <p className="font-sans text-sm text-stone-400">
                Showing {rangeFrom}–{rangeTo} of {total}{" "}
                {total === 1 ? "article" : "articles"}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 rounded hover:bg-stone-50 transition-colors"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="font-sans text-sm border border-stone-100 text-stone-300 px-4 py-2 rounded cursor-not-allowed select-none">
                    ← Previous
                  </span>
                )}
                <span className="font-sans text-xs text-stone-400 px-2">
                  {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 rounded hover:bg-stone-50 transition-colors"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="font-sans text-sm border border-stone-100 text-stone-300 px-4 py-2 rounded cursor-not-allowed select-none">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="py-16 text-center font-sans text-sm text-stone-400 italic">
            {category ? "No articles in this category yet." : "No articles published yet."}
          </p>
        )}

      </main>
      <Footer />
    </>
  );
}
