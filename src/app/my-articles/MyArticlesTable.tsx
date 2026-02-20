"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { SupabaseArticle } from "@/types";
import { formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type SortColumn = "title" | "category" | "status" | "created_at";
type SortOrder  = "asc" | "desc";

// ── Badge maps ─────────────────────────────────────────────────────────────

const statusBadge: Record<string, string> = {
  draft:     "bg-stone-100 text-stone-600",
  submitted: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
};

const statusLabel: Record<string, string> = {
  draft:     "Draft",
  submitted: "Submitted",
  published: "Published",
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  initialArticles: SupabaseArticle[];
  initialTotal:    number;
  pageSize?:       number;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyArticlesTable({
  initialArticles,
  initialTotal,
  pageSize = 15,
}: Props) {
  const [articles,  setArticles]  = useState<SupabaseArticle[]>(initialArticles);
  const [total,     setTotal]     = useState(initialTotal);
  const [page,      setPage]      = useState(1);
  const [sortBy,    setSortBy]    = useState<SortColumn>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [fetching,  setFetching]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // ── Fetch a page from the API ────────────────────────────────────────────

  const fetchPage = useCallback(async (
    nextPage: number,
    nextSortBy: SortColumn,
    nextSortOrder: SortOrder,
  ) => {
    setFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:      String(nextPage),
        limit:     String(pageSize),
        sortBy:    nextSortBy,
        sortOrder: nextSortOrder,
      });
      const res = await fetch(`/api/articles?${params}`);
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Fetch failed");
      }
      const { data, total: newTotal } = await res.json();
      setArticles(data);
      setTotal(newTotal);
      setPage(nextPage);
      setSortBy(nextSortBy);
      setSortOrder(nextSortOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setFetching(false);
    }
  }, [pageSize]);

  // ── Sort handler ─────────────────────────────────────────────────────────

  function handleSort(col: SortColumn) {
    const nextOrder: SortOrder =
      col === sortBy ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    fetchPage(1, col, nextOrder);
  }

  // ── Pagination helpers ───────────────────────────────────────────────────

  const totalPages = Math.ceil(total / pageSize);
  const rangeFrom  = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo    = Math.min(page * pageSize, total);

  // ── Sort indicator ───────────────────────────────────────────────────────

  function SortIcon({ col }: { col: SortColumn }) {
    if (col !== sortBy) return <span className="ml-1 text-stone-300">↕</span>;
    return <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;
  }

  function ColHeader({ col, label, className }: { col: SortColumn; label: string; className?: string }) {
    return (
      <th className={`pb-3 text-left ${className ?? ""}`}>
        <button
          onClick={() => handleSort(col)}
          className="flex items-center text-xs uppercase tracking-wider text-stone-400 font-medium hover:text-stone-700 transition-colors"
        >
          {label}<SortIcon col={col} />
        </button>
      </th>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm font-sans px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      <div className={`overflow-x-auto transition-opacity ${fetching ? "opacity-50 pointer-events-none" : ""}`}>
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              <ColHeader col="title"      label="Title"    className="pr-4" />
              <ColHeader col="status"     label="Status"   className="pr-4" />
              <ColHeader col="category"   label="Category" className="pr-4" />
              <ColHeader col="created_at" label="Date"     className="pr-4" />
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium text-left">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {articles.map((article) => (
              <tr key={article.id} className="group">
                <td className="py-3 pr-4 max-w-xs">
                  <p className="font-medium text-stone-900 truncate">{article.title || "Untitled"}</p>
                  <p className="text-xs text-stone-400 font-mono truncate">{article.slug}</p>
                </td>
                <td className="py-3 pr-4">
                  <span className={`inline-block text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${statusBadge[article.status] ?? "bg-stone-100 text-stone-600"}`}>
                    {statusLabel[article.status] ?? article.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-stone-600 text-xs">
                  {article.category ?? "—"}
                </td>
                <td className="py-3 pr-4 text-xs text-stone-400 whitespace-nowrap">
                  {formatDate(article.published_at ?? article.created_at)}
                </td>
                <td className="py-3">
                  {article.status !== "published" && (
                    <Link
                      href={`/editor/${article.id}`}
                      className="text-xs font-sans text-stone-600 hover:text-stone-900 border border-stone-200 px-2 py-1 rounded hover:bg-stone-50 transition-colors"
                    >
                      Edit
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {articles.length === 0 && !fetching && (
          <p className="py-8 text-center text-sm text-stone-400 font-sans italic">
            No articles yet. Click &ldquo;+ New Article&rdquo; to get started.
          </p>
        )}
      </div>

      {/* ── Pagination ── */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4">
          <p className="font-sans text-xs text-stone-400">
            Showing {rangeFrom}–{rangeTo} of {total} {total === 1 ? "article" : "articles"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchPage(page - 1, sortBy, sortOrder)}
              disabled={page <= 1 || fetching}
              className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="font-sans text-xs text-stone-400 px-2 flex items-center">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => fetchPage(page + 1, sortBy, sortOrder)}
              disabled={page >= totalPages || fetching}
              className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
