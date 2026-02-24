import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import type { SupabaseArticle } from "@/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: { userId: string } }
): Promise<Metadata> {
  const profile = await fetchProfile(params.userId) as AuthorProfile | null;
  if (!profile) return {};
  const name = await resolveName(profile);
  return { title: name };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchProfile(userId: string) {
  const { data } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("user_id, first_name, last_name, is_legacy, bio, photo_url")
    .eq("user_id", userId)
    .single();
  return data ?? null;
}

type AuthorProfile = {
  user_id:    string;
  first_name: string | null;
  last_name:  string | null;
  is_legacy:  boolean;
  bio:        string | null;
  photo_url:  string | null;
};

async function resolveName(profile: AuthorProfile): Promise<string> {
  const dbName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  if (dbName) return dbName;
  if (profile.is_legacy) return "—";
  // Fall back to Clerk for regular users whose name isn't cached in the DB
  try {
    const clerk = await clerkClient();
    const u = await clerk.users.getUser(profile.user_id);
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "—";
  } catch {
    return "—";
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function AuthorPage({
  params,
}: {
  params: { userId: string };
}) {
  const profile = await fetchProfile(params.userId) as AuthorProfile | null;
  if (!profile) notFound();

  const [name, { data: articles }] = await Promise.all([
    resolveName(profile),
    getSupabaseAdmin()
      .from("articles")
      .select("id, title, slug, category, excerpt, published_at, access_tier, featured_image_url")
      .contains("author_ids", [params.userId])
      .eq("status", "published")
      .order("published_at", { ascending: false }),
  ]);

  const publishedArticles = (articles ?? []) as Pick<
    SupabaseArticle,
    "id" | "title" | "slug" | "category" | "excerpt" | "published_at" | "access_tier" | "featured_image_url"
  >[];

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-sans text-stone-400 mb-8">
          <Link href="/" className="hover:text-stone-600 transition-colors">Home</Link>
          <span>/</span>
          <Link href="/articles" className="hover:text-stone-600 transition-colors">Articles</Link>
          <span>/</span>
          <span>{name}</span>
        </nav>

        {/* Author header */}
        <div className="border-b border-stone-100 pb-8 mb-10">
          <div className="flex items-center gap-4 mb-3">
            {profile.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photo_url}
                alt={name}
                className="w-14 h-14 rounded-full object-cover bg-stone-200 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-stone-200 flex items-center justify-center text-xl font-semibold text-stone-500 shrink-0">
                {name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div>
              <h1 className="font-serif text-3xl font-bold text-stone-900">{name}</h1>
              {profile.is_legacy && (
                <span className="inline-block mt-1 text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-stone-100 text-stone-500">
                  Archive Author
                </span>
              )}
            </div>
          </div>
          {profile.bio && (
            <p className="font-sans text-stone-600 text-sm leading-relaxed mt-4">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Articles */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-stone-400 mb-6">
            Articles by {name}
          </h2>
          {publishedArticles.length === 0 ? (
            <p className="font-sans text-sm text-stone-400 italic">No published articles yet.</p>
          ) : (
            <ul className="space-y-6">
              {publishedArticles.map((article) => (
                <li key={article.id} className="border-b border-stone-100 pb-6 last:border-0">
                  <Link
                    href={`/articles/${article.slug}`}
                    className="group block"
                  >
                    {article.category && (
                      <p className="font-sans text-xs uppercase tracking-wide text-stone-400 mb-1">
                        {article.category}
                      </p>
                    )}
                    <h3 className="font-serif text-xl font-bold text-stone-900 group-hover:text-stone-600 transition-colors mb-1">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="font-sans text-sm text-stone-500 line-clamp-2 mb-2">
                        {article.excerpt}
                      </p>
                    )}
                    <p className="font-sans text-xs text-stone-400">
                      {formatDate(article.published_at ?? "")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>
      <Footer />
    </>
  );
}
