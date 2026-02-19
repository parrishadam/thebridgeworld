"use client";

import { useState } from "react";
import Link from "next/link";
import type { SupabaseArticle } from "@/types";
import { formatDate } from "@/lib/utils";

const statusBadge: Record<string, string> = {
  draft:     "bg-stone-100 text-stone-600",
  review:    "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
};

const tierBadge: Record<string, string> = {
  free:    "bg-stone-100 text-stone-600",
  paid:    "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
};

export default function AdminArticlesTable({
  initialArticles,
}: {
  initialArticles: SupabaseArticle[];
}) {
  const [articles, setArticles] = useState<SupabaseArticle[]>(initialArticles);
  const [loading, setLoading]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handlePublish(id: string) {
    setLoading(id);
    setError(null);
    try {
      const article = articles.find((a) => a.id === id);
      if (!article) return;
      const res = await fetch(`/api/articles/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...article, status: "published" }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Failed to publish");
      }
      const updated = await res.json();
      setArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    setLoading(id);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Failed to delete");
      }
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm font-sans px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left">
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-4">Title</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-4">Author</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-4">Status</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-4">Tier</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-4">Date</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {articles.map((article) => (
              <tr key={article.id} className="group">
                <td className="py-3 pr-4 max-w-xs">
                  <p className="font-medium text-stone-900 truncate">{article.title || "Untitled"}</p>
                  <p className="text-xs text-stone-400 font-mono truncate">{article.slug}</p>
                </td>
                <td className="py-3 pr-4 text-stone-600 text-xs">
                  {article.author_name ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${
                      statusBadge[article.status] ?? "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {article.status}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${
                      tierBadge[article.access_tier] ?? "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {article.access_tier}
                  </span>
                </td>
                <td className="py-3 pr-4 text-xs text-stone-400">
                  {article.published_at
                    ? formatDate(article.published_at)
                    : formatDate(article.created_at)}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/editor/${article.id}`}
                      className="text-xs font-sans text-stone-600 hover:text-stone-900 border border-stone-200 px-2 py-1 rounded hover:bg-stone-50 transition-colors"
                    >
                      Edit
                    </Link>
                    {article.status !== "published" && (
                      <button
                        onClick={() => handlePublish(article.id)}
                        disabled={loading === article.id}
                        className="text-xs font-sans text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      >
                        {loading === article.id ? "…" : "Publish"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(article.id)}
                      disabled={loading === article.id}
                      className="text-xs font-sans text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {articles.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-400 font-sans italic">
            No articles yet. Create one in the editor.
          </p>
        )}
      </div>
    </>
  );
}
