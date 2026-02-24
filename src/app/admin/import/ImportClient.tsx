"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ContentBlock } from "@/types";
import { validateContentBlocks, hasHandErrors } from "@/lib/validateBlocks";
import BlockList from "@/components/editor/BlockList";
import SupabaseArticleRenderer from "@/components/articles/SupabaseArticleRenderer";
import { MONTH_NAMES } from "@/lib/importPrompt";

// ── Types ───────────────────────────────────────────────────────────────────

interface ParsedArticle {
  title: string;
  author_name: string;
  category: string;
  tags: string[];
  source_page: number;
  excerpt: string;
  content_blocks: ContentBlock[];
  _sourceText: string;
}

interface IssueMeta {
  month: number;
  year: number;
  volume: number | null;
  number: number | null;
  title: string;
}

interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

interface ImportStats {
  totalDurationMs: number;
  pdfExtractMs: number;
  tocCall: CallUsage;
  articleCalls: Array<{ title: string } & CallUsage>;
  totals: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    apiCalls: number;
  };
}

interface AutoFixResult {
  blockId: string;
  direction: string;
  suit: string;
  before: string;
  after: string;
}

interface ImportResponse {
  issue: IssueMeta;
  articles: ParsedArticle[];
  warnings: Array<{
    articleIndex: number;
    title: string;
    errors: Array<{
      blockIndex: number;
      blockId: string;
      blockType: string;
      errors: string[];
    }>;
  }>;
  articleErrors?: Array<{
    articleIndex: number;
    title: string;
    error: string;
  }>;
  autoFixes?: AutoFixResult[];
  extractedTextLength: number;
  articleCount: number;
  stats?: ImportStats;
}

type Step = "upload" | "review" | "publish";

const CATEGORIES = [
  "Editorial",
  "Tournament Report",
  "Bidding Theory",
  "Card Play",
  "Defense",
  "Swiss Match",
  "Challenge the Champs",
  "Master Solvers' Club",
  "Test Your Play",
  "Letters",
  "History",
  "Convention",
  "Book Review",
];

// ── localStorage persistence ─────────────────────────────────────────────

const LS_KEY = "bridge-world-import-session";

interface SavedSession {
  step: Step;
  issueMeta: IssueMeta;
  articles: ParsedArticle[];
  selected: number[];
  articleErrors: Array<{ articleIndex: number; title: string; error: string }>;
  autoFixes: AutoFixResult[];
  stats: ImportStats | null;
  savedAt: number;
}

function saveSession(session: SavedSession) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(session));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SavedSession;
    // Discard sessions older than 24 hours
    if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ImportClient() {
  // Step state
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Issue metadata (extracted by Claude, editable in review)
  const [issueMeta, setIssueMeta] = useState<IssueMeta>({
    month: 0,
    year: 0,
    volume: null,
    number: null,
    title: "",
  });

  // Review state
  const [articles, setArticles] = useState<ParsedArticle[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Import stats
  const [stats, setStats] = useState<ImportStats | null>(null);

  // Article parse errors from Pass 2
  const [articleErrors, setArticleErrors] = useState<
    Array<{ articleIndex: number; title: string; error: string }>
  >([]);

  // Auto-fix results
  const [autoFixes, setAutoFixes] = useState<AutoFixResult[]>([]);

  // Per-article retry state: set of article indices currently being retried
  const [retrying, setRetrying] = useState<Set<number>>(new Set());

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<
    Array<{ title: string; success: boolean; error?: string; slug?: string }>
  >([]);

  // Track whether we've already restored to avoid double-restore
  const restoredRef = useRef(false);
  const [restoredFromSave, setRestoredFromSave] = useState(false);

  // ── Restore from localStorage on mount ─────────────────────────────────

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const session = loadSession();
    if (session && session.articles.length > 0) {
      setStep(session.step === "publish" ? "review" : session.step);
      setIssueMeta(session.issueMeta);
      setArticles(session.articles);
      setSelected(new Set(session.selected));
      setArticleErrors(session.articleErrors || []);
      setAutoFixes(session.autoFixes || []);
      setStats(session.stats || null);
      setSelectedIndex(0);
      setRestoredFromSave(true);
    }
  }, []);

  // ── Resume from server drafts ────────────────────────────────────────

  const loadDrafts = useCallback(async () => {
    if (!issueMeta.month || !issueMeta.year || articles.length > 0) return;
    try {
      const res = await fetch(
        `/api/admin/import/drafts?year=${issueMeta.year}&month=${issueMeta.month}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.articles) && data.articles.length > 0) {
        const mapped: ParsedArticle[] = data.articles.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any) => ({
            title: a.title || "",
            author_name: a.author_name || "",
            category: a.category || "",
            tags: a.tags || [],
            source_page: a.source_page || 0,
            excerpt: a.excerpt || "",
            content_blocks: a.content_blocks || [],
            _sourceText: "",
          }),
        );
        setArticles(mapped);
        setSelected(new Set(mapped.map((_, i) => i)));
        setSelectedIndex(0);
        setStep("review");
        setRestoredFromSave(true);
      }
    } catch {
      // silently ignore — drafts endpoint may not exist yet
    }
  }, [issueMeta.month, issueMeta.year, articles.length]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // ── Save to localStorage whenever review state changes ─────────────────

  const persistSession = useCallback(() => {
    if (articles.length === 0) return;
    saveSession({
      step,
      issueMeta,
      articles,
      selected: Array.from(selected),
      articleErrors,
      autoFixes,
      stats,
      savedAt: Date.now(),
    });
  }, [step, issueMeta, articles, selected, articleErrors, autoFixes, stats]);

  useEffect(() => {
    if (step === "review" || step === "publish") {
      persistSession();
    }
  }, [step, persistSession]);

  // ── Upload & Parse ──────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setParseError(null);

    try {
      const form = new FormData();
      form.append("pdf", file);

      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: form,
      });

      const data: ImportResponse & { error?: string } = await res.json();

      if (!res.ok) {
        setParseError(data.error || `Request failed (${res.status})`);
        return;
      }

      setIssueMeta(data.issue);
      setArticles(data.articles);
      setArticleErrors(data.articleErrors || []);
      setAutoFixes(data.autoFixes || []);
      setStats(data.stats || null);
      setSelected(new Set(data.articles.map((_, i) => i)));
      setSelectedIndex(0);
      setStep("review");
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Network error",
      );
    } finally {
      setParsing(false);
    }
  }, [file]);

  // ── Article editing helpers ─────────────────────────────────────────────

  function updateArticle(index: number, patch: Partial<ParsedArticle>) {
    setArticles((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }

  function deleteArticle(index: number) {
    setArticles((prev) => prev.filter((_, i) => i !== index));
    setSelected((prev) => {
      const next = new Set<number>();
      Array.from(prev).forEach((s) => {
        if (s < index) next.add(s);
        else if (s > index) next.add(s - 1);
      });
      return next;
    });
    if (selectedIndex >= articles.length - 1) {
      setSelectedIndex(Math.max(0, articles.length - 2));
    }
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // ── Retry single article ────────────────────────────────────────────────

  const retryArticle = useCallback(
    async (index: number) => {
      const article = articles[index];
      if (!article?._sourceText) return;

      setRetrying((prev) => new Set(prev).add(index));

      try {
        const res = await fetch("/api/admin/import/article", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleText: article._sourceText,
            title: article.title,
            author_name: article.author_name,
            source_page: article.source_page,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setArticleErrors((prev) =>
            prev.map((e) =>
              e.articleIndex === index
                ? { ...e, error: data.error || "Retry failed" }
                : e,
            ),
          );
          return;
        }

        // Success — update content_blocks and remove from errors
        setArticles((prev) =>
          prev.map((a, i) =>
            i === index
              ? { ...a, content_blocks: data.content_blocks }
              : a,
          ),
        );
        setArticleErrors((prev) =>
          prev.filter((e) => e.articleIndex !== index),
        );
      } catch (err) {
        setArticleErrors((prev) =>
          prev.map((e) =>
            e.articleIndex === index
              ? { ...e, error: err instanceof Error ? err.message : "Network error" }
              : e,
          ),
        );
      } finally {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    },
    [articles],
  );

  const retryAllFailed = useCallback(async () => {
    for (const err of articleErrors) {
      await retryArticle(err.articleIndex);
    }
  }, [articleErrors, retryArticle]);

  // ── Save / Publish helpers ──────────────────────────────────────────────

  /**
   * Save or publish articles. `targetStatus` controls whether articles are
   * saved as "draft" or "published". When saving drafts, existing draft
   * articles with the same slug are overwritten (upserted). Existing
   * published articles are skipped with a warning.
   */
  const handleSaveOrPublish = useCallback(
    async (indices: number[], targetStatus: "draft" | "published") => {
      if (!issueMeta.month || !issueMeta.year) {
        setPublishResults([
          { title: "Issue metadata", success: false, error: "Month and year are required. Edit the issue metadata before publishing." },
        ]);
        setStep("publish");
        return;
      }

      setPublishing(true);
      setPublishResults([]);
      const results: typeof publishResults = [];

      const issueName = issueMeta.title || `${MONTH_NAMES[issueMeta.month]} ${issueMeta.year}`;
      const issueSlug = `${issueMeta.year}-${String(issueMeta.month).padStart(2, "0")}`;

      try {
        const issueRes = await fetch("/api/admin/import/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: issueName,
            slug: issueSlug,
            month: issueMeta.month,
            year: issueMeta.year,
            volume: issueMeta.volume || null,
            number: issueMeta.number || null,
          }),
        });
        const issueData = await issueRes.json();
        if (!issueRes.ok) {
          setPublishResults([
            { title: "Issue creation", success: false, error: issueData.error },
          ]);
          setPublishing(false);
          return;
        }

        const issueId = issueData.id;

        // Save/publish each article
        for (const idx of indices) {
          const article = articles[idx];
          const slug = `${issueSlug}-${slugify(article.title)}`;
          const tags = article.tags.includes(issueName)
            ? article.tags
            : [...article.tags, issueName];

          try {
            // Check if article already exists with this slug
            const checkRes = await fetch(`/api/articles?slug=${encodeURIComponent(slug)}&issue_id=${encodeURIComponent(issueId)}`);
            const existing = checkRes.ok ? await checkRes.json() : null;

            if (existing?.article) {
              if (existing.article.status === "published" && targetStatus !== "published") {
                // Skip — don't overwrite a published article with a draft
                results.push({
                  title: article.title,
                  success: false,
                  error: "Already published — skipped",
                });
                continue;
              }

              if (existing.article.status === "draft" || existing.article.status === targetStatus) {
                // Upsert — update the existing article
                const res = await fetch(`/api/articles/${existing.article.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: article.title,
                    author_name: article.author_name || null,
                    author_id: null,
                    category: article.category || null,
                    tags,
                    access_tier: "paid",
                    excerpt: article.excerpt || null,
                    status: targetStatus,
                    content_blocks: article.content_blocks,
                    source_page: article.source_page || null,
                    published_at: targetStatus === "published"
                      ? new Date(issueMeta.year, issueMeta.month - 1, 1).toISOString()
                      : null,
                  }),
                });
                const data = await res.json();
                if (res.ok) {
                  results.push({ title: article.title, success: true, slug });
                } else {
                  results.push({ title: article.title, success: false, error: data.error });
                }
                continue;
              }
            }

            // Create new article
            const res = await fetch("/api/articles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: article.title,
                slug,
                author_name: article.author_name || null,
                author_id: null,
                category: article.category || null,
                tags,
                access_tier: "paid",
                excerpt: article.excerpt || null,
                status: targetStatus,
                content_blocks: article.content_blocks,
                issue_id: issueId,
                source_page: article.source_page || null,
                published_at: targetStatus === "published"
                  ? new Date(issueMeta.year, issueMeta.month - 1, 1).toISOString()
                  : null,
              }),
            });
            const data = await res.json();
            if (res.ok) {
              results.push({ title: article.title, success: true, slug });
            } else {
              results.push({
                title: article.title,
                success: false,
                error: data.error,
              });
            }
          } catch (err) {
            results.push({
              title: article.title,
              success: false,
              error: err instanceof Error ? err.message : "Network error",
            });
          }
        }
      } catch (err) {
        results.push({
          title: "Issue creation",
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        });
      }

      setPublishResults(results);
      setPublishing(false);
      setStep("publish");

      // Clear saved session if all articles published successfully
      if (targetStatus === "published" && results.length > 0 && results.every((r) => r.success)) {
        clearSession();
      }
    },
    [articles, issueMeta],
  );

  const handlePublish = useCallback(
    (indices: number[]) => handleSaveOrPublish(indices, "published"),
    [handleSaveOrPublish],
  );

  const handleSaveAsDrafts = useCallback(
    (indices: number[]) => handleSaveOrPublish(indices, "draft"),
    [handleSaveOrPublish],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const currentArticle = articles[selectedIndex] as ParsedArticle | undefined;
  const currentErrors = currentArticle
    ? validateContentBlocks(currentArticle.content_blocks)
    : [];

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 font-sans text-sm">
        {(["upload", "review", "publish"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-stone-300">&rarr;</span>}
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
                step === s
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-400"
              }`}
            >
              {i + 1}. {s}
            </span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="bg-white border border-stone-200 rounded-sm p-6 max-w-xl">
          <div className="space-y-4">
            {/* File */}
            <div>
              <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                PDF File
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="font-sans text-sm text-stone-700"
              />
              {file && (
                <p className="font-sans text-xs text-stone-400 mt-1">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
            </div>

            <p className="font-sans text-xs text-stone-400">
              Issue metadata (month, year, volume, number) will be extracted
              automatically from the PDF content.
            </p>

            {/* Parse button */}
            <button
              onClick={handleParse}
              disabled={!file || parsing}
              className="font-sans text-sm bg-stone-900 text-white px-6 py-2 hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {parsing ? "Parsing PDF..." : "Parse PDF"}
            </button>

            {parsing && (
              <div className="flex items-center gap-2 font-sans text-sm text-stone-500">
                <div className="w-4 h-4 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
                Extracting articles from PDF — this may take 2-3 minutes for a full issue...
              </div>
            )}

            {parseError && (
              <div className="bg-red-50 border border-red-200 rounded-sm p-3">
                <p className="font-sans text-sm text-red-700">{parseError}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Review ────────────────────────────────────────────── */}
      {step === "review" && (
        <div>
          {/* Restored session banner */}
          {restoredFromSave && (
            <div className="bg-stone-50 border border-stone-200 rounded-sm p-3 mb-6 flex items-center justify-between">
              <p className="font-sans text-xs text-stone-500">
                Restored previous import session for <span className="font-medium text-stone-700">{issueMeta.title || "unknown issue"}</span>
              </p>
              <button
                onClick={() => setRestoredFromSave(false)}
                className="font-sans text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Issue metadata bar */}
          <div className="bg-white border border-stone-200 rounded-sm p-4 mb-6">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Issue Metadata (extracted from PDF)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block font-sans text-xs text-stone-400 mb-0.5">Title</label>
                <input
                  value={issueMeta.title}
                  onChange={(e) => setIssueMeta((m) => ({ ...m, title: e.target.value }))}
                  className="w-full border border-stone-200 rounded-sm px-2 py-1.5 font-sans text-sm text-stone-700"
                />
              </div>
              <div>
                <label className="block font-sans text-xs text-stone-400 mb-0.5">Month</label>
                <select
                  value={issueMeta.month}
                  onChange={(e) => setIssueMeta((m) => ({ ...m, month: parseInt(e.target.value) }))}
                  className="w-full border border-stone-200 rounded-sm px-2 py-1.5 font-sans text-sm text-stone-700"
                >
                  <option value={0}>—</option>
                  {MONTH_NAMES.slice(1).map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-sans text-xs text-stone-400 mb-0.5">Year</label>
                <input
                  type="number"
                  value={issueMeta.year || ""}
                  onChange={(e) => setIssueMeta((m) => ({ ...m, year: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-stone-200 rounded-sm px-2 py-1.5 font-sans text-sm text-stone-700"
                />
              </div>
              <div>
                <label className="block font-sans text-xs text-stone-400 mb-0.5">Volume</label>
                <input
                  type="number"
                  value={issueMeta.volume ?? ""}
                  onChange={(e) => setIssueMeta((m) => ({ ...m, volume: e.target.value ? parseInt(e.target.value) : null }))}
                  className="w-full border border-stone-200 rounded-sm px-2 py-1.5 font-sans text-sm text-stone-700"
                />
              </div>
              <div>
                <label className="block font-sans text-xs text-stone-400 mb-0.5">Number</label>
                <input
                  type="number"
                  value={issueMeta.number ?? ""}
                  onChange={(e) => setIssueMeta((m) => ({ ...m, number: e.target.value ? parseInt(e.target.value) : null }))}
                  className="w-full border border-stone-200 rounded-sm px-2 py-1.5 font-sans text-sm text-stone-700"
                />
              </div>
            </div>
            {(!issueMeta.month || !issueMeta.year) && (
              <p className="font-sans text-xs text-amber-600 mt-2">
                Month and year are required before publishing. Please fill them in if they weren&apos;t extracted.
              </p>
            )}
          </div>

          {/* Import stats */}
          {stats && (
            <div className="bg-stone-50 border border-stone-200 rounded-sm p-4 mb-6">
              <details>
                <summary className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 cursor-pointer select-none">
                  Import Stats — {fmtDuration(stats.totalDurationMs)} — {stats.totals.apiCalls} API calls — ${stats.totals.costUsd.toFixed(4)}
                </summary>
                <div className="mt-3 space-y-3">
                  {/* Totals */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="font-sans text-xs text-stone-400">Total Time</p>
                      <p className="font-mono text-sm text-stone-700">{fmtDuration(stats.totalDurationMs)}</p>
                    </div>
                    <div>
                      <p className="font-sans text-xs text-stone-400">Input Tokens</p>
                      <p className="font-mono text-sm text-stone-700">{stats.totals.inputTokens.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="font-sans text-xs text-stone-400">Output Tokens</p>
                      <p className="font-mono text-sm text-stone-700">{stats.totals.outputTokens.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="font-sans text-xs text-stone-400">Est. Cost</p>
                      <p className="font-mono text-sm text-stone-700">${stats.totals.costUsd.toFixed(4)}</p>
                    </div>
                  </div>

                  {/* Per-call breakdown */}
                  <div className="overflow-x-auto">
                    <table className="w-full font-sans text-xs text-stone-600">
                      <thead>
                        <tr className="border-b border-stone-200 text-left text-stone-400">
                          <th className="py-1 pr-3">Call</th>
                          <th className="py-1 pr-3">Model</th>
                          <th className="py-1 pr-3 text-right">Time</th>
                          <th className="py-1 pr-3 text-right">In</th>
                          <th className="py-1 pr-3 text-right">Out</th>
                          <th className="py-1 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-stone-100">
                          <td className="py-1 pr-3 font-medium">TOC Pass</td>
                          <td className="py-1 pr-3 font-mono">{stats.tocCall.model.replace("claude-", "")}</td>
                          <td className="py-1 pr-3 text-right font-mono">{fmtDuration(stats.tocCall.durationMs)}</td>
                          <td className="py-1 pr-3 text-right font-mono">{stats.tocCall.inputTokens.toLocaleString()}</td>
                          <td className="py-1 pr-3 text-right font-mono">{stats.tocCall.outputTokens.toLocaleString()}</td>
                          <td className="py-1 text-right font-mono">${stats.tocCall.costUsd.toFixed(4)}</td>
                        </tr>
                        {stats.articleCalls.map((ac, i) => (
                          <tr key={i} className="border-b border-stone-100">
                            <td className="py-1 pr-3 truncate max-w-[200px]" title={ac.title}>{ac.title}</td>
                            <td className="py-1 pr-3 font-mono">{ac.model.replace("claude-", "")}</td>
                            <td className="py-1 pr-3 text-right font-mono">{fmtDuration(ac.durationMs)}</td>
                            <td className="py-1 pr-3 text-right font-mono">{ac.inputTokens.toLocaleString()}</td>
                            <td className="py-1 pr-3 text-right font-mono">{ac.outputTokens.toLocaleString()}</td>
                            <td className="py-1 text-right font-mono">${ac.costUsd.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Article parse error banner */}
          {articleErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-amber-700">
                  {articleErrors.length} article{articleErrors.length === 1 ? "" : "s"} failed to parse content
                </p>
                <button
                  onClick={retryAllFailed}
                  disabled={retrying.size > 0}
                  className="font-sans text-xs font-medium text-amber-800 border border-amber-300 px-3 py-1 rounded-sm hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {retrying.size > 0 ? "Retrying..." : "Retry All Failed"}
                </button>
              </div>
              {articleErrors.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-sans text-sm text-amber-700 min-w-0 truncate">
                    <span className="font-medium">{e.title}:</span> {e.error}
                  </p>
                  <button
                    onClick={() => retryArticle(e.articleIndex)}
                    disabled={retrying.has(e.articleIndex)}
                    className="font-sans text-xs text-amber-700 hover:text-amber-900 underline shrink-0 disabled:opacity-50 disabled:no-underline"
                  >
                    {retrying.has(e.articleIndex) ? "Retrying..." : "Retry"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Auto-fix banner */}
          {autoFixes.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-sm p-4 mb-6">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">
                Auto-fixed {autoFixes.length} hand{autoFixes.length === 1 ? "" : "s"} (14 cards → 13 by removing spurious &ldquo;2&rdquo;)
              </p>
              {autoFixes.map((f, i) => (
                <p key={i} className="font-sans text-xs text-blue-600">
                  Block {f.blockId}, {f.direction} {f.suit}: <span className="font-mono line-through">{f.before}</span> → <span className="font-mono font-medium">{f.after}</span>
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-6">
            {/* Sidebar — article list */}
            <div className="w-80 shrink-0 space-y-2">
              <div className="flex items-center justify-between mb-4">
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
                  {articles.length} articles found
                </p>
                <button
                  onClick={() => {
                    clearSession();
                    setArticles([]);
                    setIssueMeta({ month: 0, year: 0, volume: null, number: null, title: "" });
                    setArticleErrors([]);
                    setAutoFixes([]);
                    setStats(null);
                    setPublishResults([]);
                    setFile(null);
                    setSelectedIndex(0);
                    setSelected(new Set());
                    setRestoredFromSave(false);
                    setStep("upload");
                  }}
                  className="font-sans text-xs text-stone-600 hover:text-stone-900 font-medium transition-colors"
                >
                  Start New Import
                </button>
              </div>

              {articles.map((article, i) => {
                const hasErrors = hasHandErrors(article.content_blocks);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedIndex(i);
                      setPreviewMode(false);
                    }}
                    className={`border rounded-sm p-3 cursor-pointer transition-colors ${
                      selectedIndex === i
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 hover:border-stone-300"
                    } ${hasErrors ? "ring-2 ring-red-300" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(i);
                        }}
                        className="mt-1 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-serif text-sm font-semibold text-stone-900 truncate">
                          {article.title}
                        </p>
                        <p className="font-sans text-xs text-stone-400 truncate">
                          {article.author_name || "No author"}
                          {article.category && ` · ${article.category}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1 font-sans text-xs text-stone-400">
                          {article.source_page > 0 && (
                            <span>p. {article.source_page}</span>
                          )}
                          <span>
                            {article.content_blocks.length} blocks
                          </span>
                          {hasErrors && (
                            <span className="text-red-500 font-medium">
                              Validation errors
                            </span>
                          )}
                          {article.content_blocks.length === 0 && article._sourceText && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                retryArticle(i);
                              }}
                              disabled={retrying.has(i)}
                              className="text-amber-600 hover:text-amber-800 font-medium disabled:opacity-50"
                            >
                              {retrying.has(i) ? "Retrying..." : "Retry"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Publish / Save buttons */}
              <div className="pt-4 border-t border-stone-200 space-y-2">
                <button
                  onClick={() => handlePublish(Array.from(selected))}
                  disabled={publishing || selected.size === 0}
                  className="w-full font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {publishing
                    ? "Publishing..."
                    : `Publish Selected (${selected.size})`}
                </button>
                <button
                  onClick={() =>
                    handlePublish(articles.map((_, i) => i))
                  }
                  disabled={publishing || articles.length === 0}
                  className="w-full font-sans text-sm border border-stone-200 text-stone-700 px-4 py-2 hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  Publish All ({articles.length})
                </button>
                <button
                  onClick={() =>
                    handleSaveAsDrafts(articles.map((_, i) => i))
                  }
                  disabled={publishing || articles.length === 0}
                  className="w-full font-sans text-sm border border-stone-300 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  {publishing ? "Saving..." : `Save All as Drafts (${articles.length})`}
                </button>
              </div>
            </div>

            {/* Main content — article editor/preview */}
            <div className="flex-1 min-w-0">
              {currentArticle ? (
                <div>
                  {/* Article header controls */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setPreviewMode(false)}
                        className={`font-sans text-xs px-3 py-1 rounded-full transition-colors ${
                          !previewMode
                            ? "bg-stone-900 text-white"
                            : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setPreviewMode(true)}
                        className={`font-sans text-xs px-3 py-1 rounded-full transition-colors ${
                          previewMode
                            ? "bg-stone-900 text-white"
                            : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                    <button
                      onClick={() => deleteArticle(selectedIndex)}
                      className="font-sans text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Delete Article
                    </button>
                  </div>

                  {previewMode ? (
                    /* Preview */
                    <div className="bg-white border border-stone-200 rounded-sm p-6">
                      <h2 className="font-serif text-2xl font-bold text-stone-900 mb-1">
                        {currentArticle.title}
                      </h2>
                      {currentArticle.author_name && (
                        <p className="font-sans text-sm text-stone-500 mb-4">
                          By {currentArticle.author_name}
                        </p>
                      )}
                      <SupabaseArticleRenderer
                        blocks={currentArticle.content_blocks}
                      />
                    </div>
                  ) : (
                    /* Edit */
                    <div className="space-y-4">
                      {/* Metadata fields */}
                      <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-3">
                        <div>
                          <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                            Title
                          </label>
                          <input
                            value={currentArticle.title}
                            onChange={(e) =>
                              updateArticle(selectedIndex, {
                                title: e.target.value,
                              })
                            }
                            className="w-full border border-stone-200 rounded-sm px-3 py-2 font-serif text-lg text-stone-900"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                              Author
                            </label>
                            <input
                              value={currentArticle.author_name}
                              onChange={(e) =>
                                updateArticle(selectedIndex, {
                                  author_name: e.target.value,
                                })
                              }
                              className="w-full border border-stone-200 rounded-sm px-3 py-2 font-sans text-sm text-stone-700"
                            />
                          </div>
                          <div>
                            <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                              Category
                            </label>
                            <select
                              value={currentArticle.category}
                              onChange={(e) =>
                                updateArticle(selectedIndex, {
                                  category: e.target.value,
                                })
                              }
                              className="w-full border border-stone-200 rounded-sm px-3 py-2 font-sans text-sm text-stone-700"
                            >
                              <option value="">Select category...</option>
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                            Tags (comma-separated)
                          </label>
                          <input
                            value={currentArticle.tags.join(", ")}
                            onChange={(e) =>
                              updateArticle(selectedIndex, {
                                tags: e.target.value
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="w-full border border-stone-200 rounded-sm px-3 py-2 font-sans text-sm text-stone-700"
                          />
                        </div>

                        <div>
                          <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                            Excerpt
                          </label>
                          <textarea
                            value={currentArticle.excerpt}
                            onChange={(e) =>
                              updateArticle(selectedIndex, {
                                excerpt: e.target.value,
                              })
                            }
                            rows={2}
                            className="w-full border border-stone-200 rounded-sm px-3 py-2 font-sans text-sm text-stone-700 resize-none"
                          />
                        </div>
                      </div>

                      {/* Validation errors */}
                      {currentErrors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-sm p-3">
                          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-red-700 mb-2">
                            Validation Errors
                          </p>
                          {currentErrors.map((e, i) => (
                            <div
                              key={i}
                              className="font-sans text-sm text-red-600 mb-1"
                            >
                              Block #{e.blockIndex + 1} ({e.blockType}):{" "}
                              {e.errors.join("; ")}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Content blocks */}
                      <div>
                        <label className="block font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                          Content Blocks
                        </label>
                        <BlockList
                          blocks={currentArticle.content_blocks}
                          onChange={(blocks) =>
                            updateArticle(selectedIndex, {
                              content_blocks: blocks,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-20 text-stone-300 font-sans text-sm italic">
                  No articles to display.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Publish Results ───────────────────────────────────── */}
      {step === "publish" && (
        <div className="max-w-xl space-y-4">
          <div className="flex items-center justify-between mb-4">
            <p className="font-serif text-xl font-bold text-stone-900">
              Publish Results
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setStep("review");
                  setPublishResults([]);
                }}
                className="font-sans text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                &larr; Back to Review
              </button>
              <button
                onClick={() => {
                  clearSession();
                  setArticles([]);
                  setIssueMeta({ month: 0, year: 0, volume: null, number: null, title: "" });
                  setArticleErrors([]);
                  setAutoFixes([]);
                  setStats(null);
                  setPublishResults([]);
                  setFile(null);
                  setSelectedIndex(0);
                  setSelected(new Set());
                  setRestoredFromSave(false);
                  setStep("upload");
                }}
                className="font-sans text-xs text-stone-600 hover:text-stone-900 font-medium transition-colors"
              >
                Start New Import
              </button>
            </div>
          </div>

          {publishResults.map((r, i) => (
            <div
              key={i}
              className={`border rounded-sm p-3 ${
                r.success
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-lg ${
                    r.success ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {r.success ? "+" : "x"}
                </span>
                <div>
                  <p
                    className={`font-serif text-sm font-semibold ${
                      r.success ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {r.title}
                  </p>
                  {r.success && r.slug && (
                    <p className="font-sans text-xs text-green-600">
                      /articles/{r.slug}
                    </p>
                  )}
                  {r.error && (
                    <p className="font-sans text-xs text-red-600">
                      {r.error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="pt-4">
            <p className="font-sans text-sm text-stone-500">
              {publishResults.filter((r) => r.success).length} of{" "}
              {publishResults.length} articles published successfully.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
