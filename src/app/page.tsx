import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ArticleCard from "@/components/articles/ArticleCard";
import { getFeaturedArticle, getRecentArticles } from "@/lib/queries";

export const revalidate = 60; // ISR — refresh at most every 60s

export default async function HomePage() {
  const [featured, recent] = await Promise.all([
    getFeaturedArticle(),
    getRecentArticles(7),
  ]);

  // If a featured article exists, exclude it from the "recent" grid
  const grid = featured
    ? recent.filter((a) => a._id !== featured._id).slice(0, 6)
    : recent.slice(0, 6);

  // "Also in this issue" sidebar: first 4 non-featured recent articles
  const sidebar = recent.filter((a) => a._id !== featured?._id).slice(0, 4);

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="border-b-2 border-stone-900 pb-2 mb-8">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
              Latest Issue
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
                    Also in this issue
                  </h3>
                  {sidebar.map((article) => (
                    <ArticleCard key={article._id} article={article} variant="compact" />
                  ))}
                </div>
              )}
            </div>
          ) : (
            // No featured article — show a simple message
            <p className="font-sans text-stone-400 text-sm">
              No featured article yet. Mark an article as featured in the Studio.
            </p>
          )}
        </section>

        {/* ── Recent articles grid ─────────────────────────────────── */}
        {grid.length > 0 && (
          <section className="mb-16">
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

      </main>
      <Footer />
    </>
  );
}
