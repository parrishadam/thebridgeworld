"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ContentBlock, SupabaseArticle, Category, ArticleLevel } from "@/types";
import BlockList from "./BlockList";
import TagPicker from "./TagPicker";
import SupabaseArticleRenderer from "@/components/articles/SupabaseArticleRenderer";

// ── Types ──────────────────────────────────────────────────────────────────

type ArticleStatus = "draft" | "submitted" | "published";
type EditorMode = "edit" | "preview";

interface ArticleEditorProps {
  article?:    SupabaseArticle;
  isAdmin:     boolean;
  isAuthor:    boolean;
  currentUser: { id: string; name: string };
  authorList?: { id: string; name: string; email: string; isLegacy: boolean }[];
}

interface EditorMeta {
  title:             string;
  slug:              string;
  authorName:        string;
  authorId:          string;
  authorIds:         string[];
  category:          string;
  tags:              string[];
  accessTier:        "free" | "paid" | "premium";
  level:             ArticleLevel | "";
  excerpt:           string;
  status:            ArticleStatus;
  featuredImageUrl:  string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract last word of a name for sorting: "Edwin B. Kantar" → "kantar" */
function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ArticleEditor({
  article,
  isAdmin,
  currentUser,
  authorList,
}: ArticleEditorProps) {
  const router = useRouter();
  const [meta, setMeta] = useState<EditorMeta>({
    title:            article?.title ?? "",
    slug:             article?.slug ?? "",
    authorName:       article?.author_name ?? currentUser.name,
    authorId:         article?.author_id ?? currentUser.id,
    authorIds:        article?.author_ids ?? (article?.author_id ? [article.author_id] : [currentUser.id]),
    category:         article?.category ?? "",
    tags:             article?.tags ?? [],
    accessTier:       article?.access_tier ?? (isAdmin ? "free" : "paid"),
    level:            article?.level ?? "",
    excerpt:          article?.excerpt ?? "",
    status:           article?.status ?? "draft",
    featuredImageUrl: article?.featured_image_url ?? "",
  });

  const [blocks, setBlocks]           = useState<ContentBlock[]>(article?.content_blocks ?? []);
  const [mode, setMode]               = useState<EditorMode>("edit");
  const [showJson, setShowJson]       = useState(false);
  const [isDirty, setIsDirty]         = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [saveStatus, setSaveStatus]   = useState<"idle" | "saved" | "error">("idle");
  const [articleId, setArticleId]     = useState<string | null>(article?.id ?? null);
  const [slugManual, setSlugManual]   = useState(!!article?.slug);
  const [categories, setCategories]   = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(data))
      .catch(() => null);
  }, []);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Warn on browser-level navigation (refresh, close, address bar, back button)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Guarded in-app navigation
  function navigateAway(href: string) {
    if (isDirtyRef.current) {
      const ok = window.confirm(
        "Are you sure you want to leave this page? Edits have not been saved and will be lost."
      );
      if (!ok) return;
    }
    router.push(href);
  }

  // Auto-generate slug from title (only when not manually edited)
  useEffect(() => {
    if (!slugManual && meta.title) {
      setMeta((prev) => ({ ...prev, slug: slugify(meta.title) }));
    }
  }, [meta.title, slugManual]);

  // Mark dirty on any change
  function updateMeta<K extends keyof EditorMeta>(key: K, value: EditorMeta[K]) {
    setMeta((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setSaveStatus("idle");
  }

  function updateBlocks(next: ContentBlock[]) {
    setBlocks(next);
    setIsDirty(true);
    setSaveStatus("idle");
  }

  // ── Save ────────────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveStatus("idle");

    const payload = {
      title:              meta.title,
      slug:               meta.slug,
      author_name:        meta.authorName || null,
      author_id:          meta.authorIds[0] || meta.authorId || null,
      author_ids:         meta.authorIds.length > 0 ? meta.authorIds : null,
      category:           meta.category || null,
      tags:               meta.tags,
      access_tier:        meta.accessTier,
      level:              meta.level || null,
      excerpt:            meta.excerpt || null,
      status:             meta.status,
      content_blocks:     blocks,
      featured_image_url: meta.featuredImageUrl || null,
    };

    try {
      let res: Response;
      if (articleId) {
        res = await fetch(`/api/articles/${articleId}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/articles", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error ?? "Save failed");
      }

      const data = await res.json();
      if (!articleId && data.id) {
        setArticleId(data.id);
        // Update URL without full navigation
        window.history.replaceState({}, "", `/editor/${data.id}`);
      }

      // Sync featured image URL — server may have cleared it on author change
      if (articleId && data.featured_image_url !== undefined) {
        setMeta((prev) => ({ ...prev, featuredImageUrl: data.featured_image_url ?? "" }));
      }

      setIsDirty(false);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      console.error("[ArticleEditor] save failed", err);
    } finally {
      setIsSaving(false);
    }
  }, [meta, blocks, articleId, isSaving]);

  // Auto-save every 30s if dirty
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirtyRef.current) save();
    }, 30_000);
    return () => clearInterval(interval);
  }, [save]);

  const statusOptions: { value: ArticleStatus; label: string }[] = isAdmin
    ? [
        { value: "draft",     label: "Draft" },
        { value: "submitted", label: "Submit for Publication" },
        { value: "published", label: "Published" },
      ]
    : [
        { value: "draft",     label: "Draft" },
        { value: "submitted", label: "Submit for Publication" },
      ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigateAway("/")}
          className="font-serif text-sm font-bold text-stone-900 hover:text-stone-600 transition-colors whitespace-nowrap shrink-0"
        >
          The Bridge World
        </button>
        <span className="text-stone-300 shrink-0">/</span>
        <button
          onClick={() => navigateAway(isAdmin ? "/admin/articles" : "/my-articles")}
          className="font-sans text-xs text-stone-500 hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
        >
          ← Back to Articles
        </button>
        <span className="text-stone-300 shrink-0">/</span>
        <input
          type="text"
          value={meta.title}
          onChange={(e) => updateMeta("title", e.target.value)}
          placeholder="Article Title"
          className="flex-1 font-serif text-xl font-bold text-stone-900 border-0 outline-none bg-transparent placeholder:text-stone-300"
        />

        {/* Status */}
        <select
          value={meta.status}
          onChange={(e) => updateMeta("status", e.target.value as ArticleStatus)}
          className="font-sans text-xs border border-stone-200 rounded px-2 py-1.5 text-stone-600 bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Mode toggle */}
        <div className="flex border border-stone-200 rounded overflow-hidden">
          <button
            onClick={() => setMode("edit")}
            className={`font-sans text-xs px-3 py-1.5 transition-colors ${
              mode === "edit"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`font-sans text-xs px-3 py-1.5 transition-colors ${
              mode === "preview"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            Preview
          </button>
        </div>

        {/* JSON */}
        <button
          onClick={() => setShowJson(!showJson)}
          className="font-sans text-xs text-stone-400 hover:text-stone-700 transition-colors"
        >
          JSON
        </button>

        {/* Save */}
        <button
          onClick={save}
          disabled={isSaving}
          className="font-sans text-sm bg-stone-900 text-white px-4 py-1.5 hover:bg-stone-700 transition-colors disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>

        {/* Save status */}
        {saveStatus === "saved" && (
          <span className="font-sans text-xs text-emerald-600">Saved</span>
        )}
        {saveStatus === "error" && (
          <span className="font-sans text-xs text-red-600">Save failed</span>
        )}
        {isDirty && saveStatus === "idle" && (
          <span className="font-sans text-xs text-stone-400">Unsaved</span>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        {/* ── Metadata panel ───────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-4">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-400">
              Article Settings
            </p>

            {/* Slug */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Slug</label>
              <input
                type="text"
                value={meta.slug}
                onChange={(e) => {
                  setSlugManual(true);
                  updateMeta("slug", e.target.value);
                }}
                placeholder="article-slug"
                className="w-full border border-stone-200 rounded px-2 py-1.5 text-xs font-mono text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>

            {/* Authors */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">
                {meta.authorIds.length > 1 ? "Authors" : "Author"}
              </label>
              {isAdmin && authorList && authorList.length > 0 ? (
                <div className="space-y-2">
                  {/* Current authors list */}
                  {meta.authorIds.length > 0 && (
                    <div className="space-y-1">
                      {meta.authorIds.map((aid) => {
                        const author = authorList.find((a) => a.id === aid);
                        const label = author
                          ? `${author.name} ${author.isLegacy ? "(Archive)" : `(${author.email})`}`
                          : aid;
                        return (
                          <div
                            key={aid}
                            className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded px-2 py-1"
                          >
                            <span className="text-xs font-sans text-stone-700 truncate">
                              {label}
                            </span>
                            <button
                              onClick={() => {
                                const next = meta.authorIds.filter((id) => id !== aid);
                                const names = next
                                  .map((id) => authorList.find((a) => a.id === id)?.name)
                                  .filter(Boolean)
                                  .join(" and ");
                                setMeta((prev) => ({
                                  ...prev,
                                  authorIds:  next,
                                  authorId:   next[0] ?? "",
                                  authorName: names,
                                }));
                                setIsDirty(true);
                                setSaveStatus("idle");
                              }}
                              className="text-stone-400 hover:text-red-500 transition-colors text-xs ml-2 shrink-0"
                              title="Remove author"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Add author dropdown */}
                  <select
                    value=""
                    onChange={(e) => {
                      const chosen = authorList.find((a) => a.id === e.target.value);
                      if (!chosen || meta.authorIds.includes(chosen.id)) return;
                      const next = [...meta.authorIds, chosen.id];
                      const names = next
                        .map((id) => authorList.find((a) => a.id === id)?.name)
                        .filter(Boolean)
                        .join(" and ");
                      setMeta((prev) => ({
                        ...prev,
                        authorIds:  next,
                        authorId:   next[0],
                        authorName: names,
                      }));
                      setIsDirty(true);
                      setSaveStatus("idle");
                    }}
                    className="w-full border border-stone-200 rounded px-2 py-1.5 text-xs font-sans text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
                  >
                    <option value="">
                      {meta.authorIds.length === 0 ? "— Select author —" : "+ Add another author"}
                    </option>
                    {authorList
                      .filter((a) => !meta.authorIds.includes(a.id))
                      .sort((a, b) => lastNameOf(a.name).localeCompare(lastNameOf(b.name)))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} {a.isLegacy ? "(Archive)" : `(${a.email})`}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs font-sans text-stone-700 py-1">{currentUser.name}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Category</label>
              <div className="flex items-center gap-2">
                {(() => {
                  const cat = categories.find((c) => c.name === meta.category);
                  return cat?.color ? (
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: cat.color }}
                    />
                  ) : null;
                })()}
                <select
                  value={meta.category}
                  onChange={(e) => updateMeta("category", e.target.value)}
                  className="flex-1 border border-stone-200 rounded px-2 py-1.5 text-xs font-sans text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
                >
                  <option value="">— Select —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Tags</label>
              <TagPicker
                selectedTags={meta.tags}
                onChange={(tags) => updateMeta("tags", tags)}
              />
            </div>

            {/* Access tier — admin only */}
            {isAdmin && (
              <div>
                <label className="block text-xs font-sans text-stone-500 mb-1">Access Tier</label>
                <div className="flex gap-3">
                  {(["free", "paid", "premium"] as const).map((tier) => (
                    <label key={tier} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="accessTier"
                        value={tier}
                        checked={meta.accessTier === tier}
                        onChange={() => updateMeta("accessTier", tier)}
                      />
                      <span className="text-xs font-sans text-stone-600 capitalize">{tier}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Level */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Level</label>
              <select
                value={meta.level}
                onChange={(e) => updateMeta("level", e.target.value as ArticleLevel | "")}
                className="w-full border border-stone-200 rounded px-2 py-1.5 text-xs font-sans text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                <option value="">— None —</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>

            {/* Featured image */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">
                Featured Image URL
              </label>
              <input
                type="url"
                value={meta.featuredImageUrl}
                onChange={(e) => updateMeta("featuredImageUrl", e.target.value)}
                placeholder="https://..."
                className="w-full border border-stone-200 rounded px-2 py-1.5 text-xs font-sans text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>

            {/* Excerpt */}
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Excerpt</label>
              <textarea
                value={meta.excerpt}
                onChange={(e) => updateMeta("excerpt", e.target.value)}
                placeholder="Short description of the article..."
                rows={3}
                className="w-full border border-stone-200 rounded px-2 py-1.5 text-xs font-sans text-stone-700 resize-none focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>
          </div>
        </aside>

        {/* ── Main content area ─────────────────────────────────────────── */}
        <main>
          {mode === "edit" ? (
            <BlockList blocks={blocks} onChange={updateBlocks} />
          ) : (
            <div className="bg-white border border-stone-200 rounded-sm p-8 min-h-[400px]">
              {blocks.length > 0 ? (
                <SupabaseArticleRenderer blocks={blocks} />
              ) : (
                <p className="text-stone-300 font-sans text-sm italic text-center py-16">
                  No content to preview.
                </p>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── JSON Modal ────────────────────────────────────────────────────── */}
      {showJson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowJson(false)}
        >
          <div
            className="bg-white rounded-sm shadow-xl w-full max-w-2xl mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-stone-800 text-white px-4 py-3 flex items-center justify-between">
              <h2 className="font-sans text-sm font-semibold uppercase tracking-wider">
                Content Blocks JSON
              </h2>
              <button
                onClick={() => setShowJson(false)}
                className="text-stone-400 hover:text-white transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-stone-700 overflow-auto max-h-[60vh] bg-stone-50">
              {JSON.stringify(blocks, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
