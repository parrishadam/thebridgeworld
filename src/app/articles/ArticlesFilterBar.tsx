"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface Props {
  categories: string[];
  authors:    string[];
  tags:       string[];
}

const SORT_OPTIONS = [
  { value: "date-desc",   label: "Newest first" },
  { value: "date-asc",    label: "Oldest first" },
  { value: "name-asc",    label: "Title A–Z" },
  { value: "name-desc",   label: "Title Z–A" },
  { value: "author-asc",  label: "Author A–Z" },
  { value: "author-desc", label: "Author Z–A" },
];

export default function ArticlesFilterBar({ categories, authors, tags }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const current = {
    category:  searchParams.get("category")  ?? "",
    author:    searchParams.get("author")    ?? "",
    tag:       searchParams.get("tag")       ?? "",
    sortBy:    searchParams.get("sortBy")    ?? "date",
    sortOrder: searchParams.get("sortOrder") ?? "desc",
  };

  const sortValue = `${current.sortBy}-${current.sortOrder}`;

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page"); // reset to page 1 on filter change
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/articles?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleSort = useCallback(
    (combined: string) => {
      const [sortBy, sortOrder] = combined.split("-");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (sortBy === "date" && sortOrder === "desc") {
        // default — remove from URL
        params.delete("sortBy");
        params.delete("sortOrder");
      } else {
        params.set("sortBy",    sortBy);
        params.set("sortOrder", sortOrder);
      }
      router.push(`/articles?${params.toString()}`);
    },
    [router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push("/articles");
  }, [router]);

  const hasFilters =
    current.category || current.author || current.tag ||
    current.sortBy !== "date" || current.sortOrder !== "desc";

  const selectClass =
    "font-sans text-sm border border-stone-200 rounded px-3 py-1.5 bg-white text-stone-700 " +
    "hover:border-stone-300 focus:outline-none focus:border-stone-400 transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-3 mb-8">
      {/* Category */}
      {categories.length > 0 && (
        <select
          value={current.category}
          onChange={(e) => update("category", e.target.value)}
          className={selectClass}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c.toLowerCase().replace(/\s+/g, "-")}>
              {c}
            </option>
          ))}
        </select>
      )}

      {/* Author */}
      {authors.length > 0 && (
        <select
          value={current.author}
          onChange={(e) => update("author", e.target.value)}
          className={selectClass}
          aria-label="Filter by author"
        >
          <option value="">All authors</option>
          {authors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}

      {/* Tag */}
      {tags.length > 0 && (
        <select
          value={current.tag}
          onChange={(e) => update("tag", e.target.value)}
          className={selectClass}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      {/* Sort */}
      <select
        value={sortValue}
        onChange={(e) => handleSort(e.target.value)}
        className={selectClass}
        aria-label="Sort articles"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="font-sans text-xs text-stone-400 hover:text-stone-700 border border-stone-200 px-3 py-1.5 rounded transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
