import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SupabaseArticleRenderer from "@/components/articles/SupabaseArticleRenderer";
import PaywallBanner from "@/components/subscription/PaywallBanner";
import { getSupabaseArticleBySlug, extractHandData } from "@/lib/articles";
import { getSupabaseAdmin } from "@/lib/supabase";
import ArticleCardImage from "@/components/articles/ArticleCardImage";
import { getSubscriptionStatus } from "@/lib/subscription";
import { getCategoryByName } from "@/lib/categories";
import { formatDate, formatArticleDate, issueMonthYear } from "@/lib/utils";

// Never statically cache — paywall checks must run fresh on every request
export const dynamic = "force-dynamic";

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const article = await getSupabaseArticleBySlug(params.slug);
  if (!article) return {};
  const ogImage = article.featured_image_url
    ? article.featured_image_url
    : `/api/og/${params.slug}`;
  return {
    title:       article.title,
    description: article.excerpt ?? undefined,
    openGraph: {
      title:         article.title,
      description:   article.excerpt ?? undefined,
      type:          "article",
      publishedTime: article.published_at ?? undefined,
      images:        [{ url: ogImage, width: 1200, height: 630 }],
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ArticlePage(
  { params }: { params: { slug: string } }
) {
  const { userId } = await auth();

  const article = await getSupabaseArticleBySlug(params.slug);
  if (!article) notFound();

  const status  = userId ? await getSubscriptionStatus(userId) : null;
  const isAdmin = status?.isAdmin ?? false;

  // Non-admins only see published articles
  if (article.status !== "published" && !isAdmin) notFound();

  const articleTier = article.access_tier ?? "free";
  let paywallVariant: "sign_in" | "upgrade_paid" | "upgrade_premium" | null = null;

  if (articleTier !== "free") {
    if (!userId) {
      paywallVariant = "sign_in";
    } else if (!isAdmin) {
      if (articleTier === "premium" && status?.tier !== "premium") {
        paywallVariant = "upgrade_premium";
      } else if (articleTier === "paid" && status?.tier === "free") {
        paywallVariant = "upgrade_paid";
      }
    }
  }

  const showPaywall = paywallVariant !== null;
  const catSlug = article.category?.toLowerCase().replace(/\s+/g, "-") ?? "";

  const [catEntry, authorProfile] = await Promise.all([
    article.category ? getCategoryByName(article.category) : null,
    article.author_id
      ? getSupabaseAdmin()
          .from("user_profiles")
          .select("photo_url")
          .eq("user_id", article.author_id)
          .single()
          .then(({ data }) => data as { photo_url: string | null } | null)
      : null,
  ]);
  const catColor    = catEntry?.color ?? null;
  const authorPhoto = authorProfile?.photo_url ?? null;
  const handData    = extractHandData(article.content_blocks ?? []);

  return (
    <>
      <Header />
      <main>
        <div className="max-w-3xl mx-auto px-4 pt-12 pb-8">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs font-sans text-stone-400 mb-6">
            <Link href="/" className="hover:text-stone-600 transition-colors">Home</Link>
            <span>/</span>
            <Link href="/articles" className="hover:text-stone-600 transition-colors">Articles</Link>
            {article.category && (
              <>
                <span>/</span>
                <Link
                  href={`/articles?category=${catSlug}`}
                  className="hover:text-stone-600 transition-colors"
                >
                  {article.category}
                </Link>
              </>
            )}
            {isAdmin && (
              <Link
                href={`/editor/${article.id}`}
                className="ml-auto font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
              >
                Edit
              </Link>
            )}
          </nav>

          {/* Draft / submitted banner for admins */}
          {isAdmin && article.status !== "published" && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-sm px-4 py-2 flex items-center gap-3">
              <span className="font-sans text-xs font-semibold uppercase tracking-wider text-amber-700">
                {article.status}
              </span>
              <span className="font-sans text-xs text-amber-600">
                This article is not published and is only visible to admins.
              </span>
            </div>
          )}

          {/* Category badge */}
          {article.category && (
            <Link
              href={`/articles?category=${catSlug}`}
              className={`inline-block text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded mb-4${catColor?.startsWith("#") ? "" : " bg-stone-100 text-stone-700"}`}
              style={catColor?.startsWith("#") ? { backgroundColor: catColor + "26", color: catColor } : undefined}
            >
              {article.category}
            </Link>
          )}

          {/* Title */}
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-stone-900 leading-tight mb-4">
            {article.title}
          </h1>

          {/* Byline */}
          <div className="flex items-center gap-3 border-t border-b border-stone-100 py-4 mb-8">
            {authorPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={authorPhoto}
                alt={article.author_name ?? "Author"}
                className="w-10 h-10 rounded-full object-cover bg-stone-200 shrink-0"
              />
            )}
            <div className="font-sans text-sm">
              {article.author_name && (
                article.author_id ? (
                  <Link
                    href={`/authors/${article.author_id}`}
                    className="font-semibold text-stone-900 hover:text-stone-600 transition-colors"
                  >
                    {article.author_name}
                  </Link>
                ) : (
                  <p className="font-semibold text-stone-900">{article.author_name}</p>
                )
              )}
              {article.published_at && (
                <p className="text-stone-400">{formatArticleDate(article.published_at, issueMonthYear(article.month, article.year))}</p>
              )}
            </div>
            {article.tags && article.tags.length > 0 && (
              <div className="ml-auto flex flex-wrap gap-1.5 justify-end">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-sans text-stone-400 border border-stone-200 rounded px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hero image or generated card */}
        <div className="max-w-5xl mx-auto px-4 mb-10">
          {article.featured_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.featured_image_url}
              alt={article.title}
              className="w-full rounded-sm object-cover max-h-[520px]"
            />
          ) : (
            <div className="w-full rounded-sm overflow-hidden" style={{ height: 340 }}>
              <ArticleCardImage
                fill
                variant="featured"
                title={article.title}
                author={article.author_name ?? undefined}
                authorPhoto={authorPhoto ?? undefined}
                category={article.category ?? undefined}
                categoryColor={catColor ?? undefined}
                contract={handData?.contract}
                declarer={handData?.declarer}
                hand={handData}
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="max-w-3xl mx-auto px-4 pb-16">
          {showPaywall ? (
            <PaywallBanner variant={paywallVariant!} />
          ) : (
            <SupabaseArticleRenderer blocks={article.content_blocks} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
