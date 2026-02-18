import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PortableTextRenderer from "@/components/articles/PortableTextRenderer";
import PaywallBanner from "@/components/subscription/PaywallBanner";
import { getArticleBySlug, getArticleSlugs } from "@/lib/queries";
import { getSubscriptionStatus, trackArticleView } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

// ── Static params ──────────────────────────────────────────────────────────

export async function generateStaticParams() {
  const slugs = await getArticleSlugs();
  return slugs.map(({ slug }) => ({ slug }));
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const article = await getArticleBySlug(params.slug);
  if (!article) return {};

  return {
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.excerpt,
    openGraph: {
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt,
      type: "article",
      publishedTime: article.publishedAt,
      ...(article.coverImageUrl && {
        images: [{ url: article.coverImageUrl }],
      }),
    },
  };
}

// ── Colour helper ──────────────────────────────────────────────────────────

const colorClasses: Record<string, string> = {
  blue:    "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  violet:  "bg-violet-100 text-violet-700",
  amber:   "bg-amber-100 text-amber-700",
  rose:    "bg-rose-100 text-rose-700",
  sky:     "bg-sky-100 text-sky-700",
  stone:   "bg-stone-100 text-stone-700",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ArticlePage(
  { params }: { params: { slug: string } }
) {
  // Fetch article and auth state in parallel
  const [article, { userId }] = await Promise.all([
    getArticleBySlug(params.slug),
    auth(),
  ]);

  if (!article) notFound();

  // ── Subscription / paywall logic ─────────────────────────────────────────

  let paywallVariant: "unauthenticated" | "limit_reached" | null = null;

  if (!userId) {
    paywallVariant = "unauthenticated";
  } else {
    const status = await getSubscriptionStatus(userId);
    if (!status.canView) {
      paywallVariant = "limit_reached";
    } else {
      // Track the view only when the user can actually read the article
      await trackArticleView(userId, params.slug);
    }
  }

  const showPaywall = paywallVariant !== null;
  const badgeClass  = colorClasses[article.category?.color ?? ""] ?? "bg-stone-100 text-stone-700";

  return (
    <>
      <Header />
      <main>

        {/* ── Article header (always visible) ────────────────────────── */}
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
                  href={`/articles?category=${article.category.slug}`}
                  className="hover:text-stone-600 transition-colors"
                >
                  {article.category.name}
                </Link>
              </>
            )}
          </nav>

          {/* Category badge */}
          {article.category && (
            <Link
              href={`/articles?category=${article.category.slug}`}
              className={`inline-block text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded mb-4 ${badgeClass}`}
            >
              {article.category.name}
            </Link>
          )}

          {/* Title */}
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-stone-900 leading-tight mb-4">
            {article.title}
          </h1>

          {/* Subtitle / deck */}
          {article.subtitle && (
            <p className="font-serif text-xl md:text-2xl text-stone-500 mb-6">
              {article.subtitle}
            </p>
          )}

          {/* Byline */}
          <div className="flex items-center gap-3 border-t border-b border-stone-100 py-4 mb-8">
            {article.author?.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.author.avatarUrl}
                alt={article.author.name}
                className="w-10 h-10 rounded-full object-cover bg-stone-200"
              />
            )}
            <div className="font-sans text-sm">
              {article.author && (
                <p className="font-semibold text-stone-900">{article.author.name}</p>
              )}
              {article.publishedAt && (
                <p className="text-stone-400">{formatDate(article.publishedAt)}</p>
              )}
            </div>
            {article.tags && article.tags.length > 0 && (
              <div className="ml-auto flex flex-wrap gap-1.5 justify-end">
                {article.tags.map((tag) => (
                  <Link
                    key={tag._id}
                    href={`/articles?category=${tag.slug}`}
                    className="text-xs font-sans text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-2 py-0.5 transition-colors"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Featured image (always visible) ───────────────────────────── */}
        {article.coverImageUrl && (
          <div className="max-w-5xl mx-auto px-4 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.coverImageUrl}
              alt={article.title}
              className="w-full rounded-sm object-cover max-h-[520px]"
            />
          </div>
        )}

        {/* ── Body content or paywall ────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-4 pb-16">
          {showPaywall ? (
            <PaywallBanner variant={paywallVariant!} />
          ) : (
            <>
              {article.content && article.content.length > 0 ? (
                <PortableTextRenderer content={article.content} />
              ) : (
                <p className="text-stone-400 font-sans italic">No content yet.</p>
              )}

              {/* Author bio */}
              {article.author?.bio && (
                <div className="mt-16 pt-8 border-t border-stone-200 flex gap-4">
                  {article.author.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.author.avatarUrl}
                      alt={article.author.name}
                      className="w-14 h-14 rounded-full object-cover bg-stone-200 flex-shrink-0"
                    />
                  )}
                  <div>
                    <p className="font-sans text-xs uppercase tracking-wider text-stone-400 mb-1">
                      About the author
                    </p>
                    <p className="font-serif font-bold text-stone-900 mb-1">
                      {article.author.name}
                    </p>
                    <p className="font-sans text-sm text-stone-500 leading-relaxed">
                      {article.author.bio}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </main>
      <Footer />
    </>
  );
}
