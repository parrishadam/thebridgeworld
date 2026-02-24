import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Issues — Bridge World",
};

interface IssueRow {
  id: string;
  title: string;
  slug: string;
  month: number;
  year: number;
  volume: number | null;
  number: number | null;
  cover_image_url: string | null;
  published_at: string | null;
  article_count: number;
}

export default async function IssuesPage() {
  const supabase = getSupabaseAdmin();

  // Fetch issues with article count
  const { data: issues } = await supabase
    .from("issues")
    .select("*, articles(count)")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const rows: IssueRow[] = (issues ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row: any) => ({
      ...row,
      article_count:
        Array.isArray(row.articles) && row.articles[0]
          ? row.articles[0].count
          : 0,
    }),
  );

  // Group by year
  const byYear = new Map<number, IssueRow[]>();
  for (const issue of rows) {
    const list = byYear.get(issue.year) ?? [];
    list.push(issue);
    byYear.set(issue.year, list);
  }

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="border-b-2 border-stone-900 pb-2 mb-8">
          <h1 className="font-serif text-3xl font-bold text-stone-900">Issues</h1>
        </div>

        {rows.length === 0 ? (
          <p className="font-sans text-stone-500">No issues published yet.</p>
        ) : (
          <div className="space-y-10">
            {Array.from(byYear.entries()).map(([year, yearIssues]) => (
              <div key={year}>
                <h2 className="font-serif text-xl font-bold text-stone-900 mb-4">
                  {year}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {yearIssues.map((issue) => (
                    <Link
                      key={issue.id}
                      href={`/issues/${issue.slug}`}
                      className="group border border-stone-200 rounded-sm overflow-hidden hover:border-stone-400 transition-colors"
                    >
                      {issue.cover_image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={issue.cover_image_url}
                          alt={issue.title}
                          className="w-full aspect-[3/4] object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] bg-stone-100 flex items-center justify-center">
                          <span className="font-serif text-lg text-stone-300">
                            {issue.title}
                          </span>
                        </div>
                      )}
                      <div className="p-2">
                        <p className="font-serif text-sm font-semibold text-stone-900 group-hover:text-stone-700 transition-colors">
                          {issue.title}
                        </p>
                        <p className="font-sans text-xs text-stone-400">
                          {issue.article_count}{" "}
                          {issue.article_count === 1 ? "article" : "articles"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
