import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ArticleCard from "@/components/articles/ArticleCard";
import { getPublishedSupabaseArticles, mapSupabaseToCardShape } from "@/lib/articles";
import { getAllCategories, buildCategoryMap } from "@/lib/categories";

export const revalidate = 60;

export default async function HomePage() {
  const [supabaseArticles, allCategories] = await Promise.all([
    getPublishedSupabaseArticles(20),
    getAllCategories(),
  ]);
  const catMap  = buildCategoryMap(allCategories);
  const articles = supabaseArticles.map((a) => mapSupabaseToCardShape(a, catMap));

  const featured = articles[0] ?? null;
  const sidebar  = articles.slice(1, 5);  // up to 4 beside the hero
  const grid     = articles.slice(5);     // remaining in the grid below

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="border-b-2 border-stone-900 pb-2 mb-8">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
              Latest Article
            </h2>
          </div>

          {featured ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7">
                <ArticleCard article={featured} variant="featured" />
              </div>

              {sidebar.length > 0 && (
                <div className="lg:col-span-5 lg:border-l lg:border-stone-200 lg:pl-8">
                  <h3 className="font-sans text-xs uppercase tracking-wider text-stone-500 border-b border-stone-100 pb-2 mb-2">
                    Recent articles
                  </h3>
                  {sidebar.map((article) => (
                    <ArticleCard key={article._id} article={article} variant="compact" />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="font-sans text-stone-400 text-sm">
              No articles published yet.
            </p>
          )}
        </section>

        {/* ── Recent articles grid ──────────────────────────────────── */}
        {grid.length > 0 && (
          <section className="mb-10">
            <div className="border-b-2 border-stone-900 pb-2 mb-8">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Recent Articles
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {grid.map((article) => (
                <ArticleCard key={article._id} article={article} />
              ))}
            </div>
          </section>
        )}

        {/* ── Browse all ────────────────────────────────────────────── */}
        {articles.length > 0 && (
          <div className="text-center mt-6">
            <Link
              href="/articles"
              className="font-sans text-sm border border-stone-200 text-stone-700 px-6 py-2.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
            >
              Browse all articles →
            </Link>
          </div>
        )}

      </main>
      <Footer />
    </>
  );
}
