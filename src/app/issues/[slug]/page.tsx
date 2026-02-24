import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getSupabaseAdmin } from "@/lib/supabase";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: issue } = await supabase
    .from("issues")
    .select("title")
    .eq("slug", slug)
    .single();

  return { title: issue ? `${issue.title} — Bridge World` : "Issue Not Found" };
}

export default async function IssueDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();

  // Fetch issue
  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!issue) notFound();

  // Fetch articles for this issue
  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, author_name, category, tags, source_page, excerpt")
    .eq("issue_id", issue.id)
    .order("source_page", { ascending: true });

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/issues"
            className="font-sans text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600 transition-colors"
          >
            ← All Issues
          </Link>
          <h1 className="font-serif text-3xl font-bold text-stone-900 mt-2">
            {issue.title}
          </h1>
          <div className="flex gap-4 mt-2 font-sans text-sm text-stone-500">
            {issue.volume && <span>Volume {issue.volume}</span>}
            {issue.number && <span>Number {issue.number}</span>}
            <span>
              {(articles ?? []).length}{" "}
              {(articles ?? []).length === 1 ? "article" : "articles"}
            </span>
          </div>
        </div>

        {/* Articles list */}
        <div className="border-t-2 border-stone-900 pt-6">
          {(articles ?? []).length === 0 ? (
            <p className="font-sans text-stone-500">
              No articles published for this issue yet.
            </p>
          ) : (
            <div className="space-y-4">
              {(articles ?? []).map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (article: any) => (
                  <Link
                    key={article.id}
                    href={`/articles/${article.slug}`}
                    className="block border border-stone-200 rounded-sm p-4 hover:border-stone-400 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="font-serif text-lg font-semibold text-stone-900">
                          {article.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                          {article.author_name && (
                            <span className="font-sans text-sm text-stone-500">
                              {article.author_name}
                            </span>
                          )}
                          {article.category && (
                            <span className="font-sans text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded">
                              {article.category}
                            </span>
                          )}
                        </div>
                        {article.excerpt && (
                          <p className="font-sans text-sm text-stone-400 mt-2 line-clamp-2">
                            {article.excerpt}
                          </p>
                        )}
                      </div>
                      {article.source_page > 0 && (
                        <span className="font-sans text-xs text-stone-400 shrink-0">
                          p. {article.source_page}
                        </span>
                      )}
                    </div>
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
