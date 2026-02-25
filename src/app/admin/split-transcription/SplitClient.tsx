"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import type { ContentBlock } from "@/types";
import SupabaseArticleRenderer from "@/components/articles/SupabaseArticleRenderer";
import {
  normalizeTens,
  stripBoilerplateBlocks,
  stripCrossReferences,
  stripAuthorFromTitle,
  mapCategory,
  inferLevel,
  interleaveProblemSolutions,
  KNOWN_PAIRS,
} from "@/lib/postProcess";
import {
  autoFixContentBlocks,
  autoFixAuctions,
  validateContentBlocks,
} from "@/lib/validateBlocks";

// ── Types ────────────────────────────────────────────────────────────────

interface PageAnnotatedBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
  page: number;
}

interface TocArticleInfo {
  title: string;
  author_name: string;
  category: string;
  tags: string[];
  source_page: number;
  pdf_pages: number[][];
  excerpt: string;
}

interface IssueMeta {
  month: number;
  year: number;
  volume: number | null;
  number: number | null;
  title: string;
}

interface FullTranscription {
  issue: IssueMeta;
  articles: TocArticleInfo[];
  blocks: PageAnnotatedBlock[];
  totalBlocks: number;
  stats: {
    totalDurationMs: number;
    apiCalls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

interface ImportResult {
  title: string;
  ok: boolean;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function truncateSlug(slug: string, maxLen = 40): string {
  if (slug.length <= maxLen) return slug;
  const cut = slug.lastIndexOf("-", maxLen);
  if (cut <= 0) return slug.slice(0, maxLen);
  return slug.slice(0, cut);
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  text: "bg-stone-100 text-stone-600",
  bridgeHand: "bg-green-100 text-green-700",
  biddingTable: "bg-blue-100 text-blue-700",
  mscResults: "bg-amber-100 text-amber-700",
  playHand: "bg-green-100 text-green-700",
  image: "bg-purple-100 text-purple-700",
  video: "bg-purple-100 text-purple-700",
  solution: "bg-orange-100 text-orange-700",
};

function isProblemArticle(title: string): boolean {
  const t = title.toLowerCase();
  return KNOWN_PAIRS.some((p) => t.includes(p));
}

// ── Color palette for article assignments ────────────────────────────────

interface ArticleColor {
  border: string;
  bg: string;
  dot: string;
}

const COLOR_PALETTE: ArticleColor[] = [
  { border: "border-l-blue-500", bg: "bg-blue-50", dot: "bg-blue-500" },
  { border: "border-l-emerald-500", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  { border: "border-l-amber-500", bg: "bg-amber-50", dot: "bg-amber-500" },
  { border: "border-l-rose-500", bg: "bg-rose-50", dot: "bg-rose-500" },
  { border: "border-l-violet-500", bg: "bg-violet-50", dot: "bg-violet-500" },
  { border: "border-l-cyan-500", bg: "bg-cyan-50", dot: "bg-cyan-500" },
  { border: "border-l-orange-500", bg: "bg-orange-50", dot: "bg-orange-500" },
  { border: "border-l-teal-500", bg: "bg-teal-50", dot: "bg-teal-500" },
  { border: "border-l-pink-500", bg: "bg-pink-50", dot: "bg-pink-500" },
  { border: "border-l-indigo-500", bg: "bg-indigo-50", dot: "bg-indigo-500" },
  { border: "border-l-lime-500", bg: "bg-lime-50", dot: "bg-lime-500" },
  { border: "border-l-fuchsia-500", bg: "bg-fuchsia-50", dot: "bg-fuchsia-500" },
  { border: "border-l-sky-500", bg: "bg-sky-50", dot: "bg-sky-500" },
  { border: "border-l-red-500", bg: "bg-red-50", dot: "bg-red-500" },
  { border: "border-l-yellow-500", bg: "bg-yellow-50", dot: "bg-yellow-500" },
];

// ── Post-processing pipeline (client-side) ──────────────────────────────

function postProcessBlocks(
  rawBlocks: PageAnnotatedBlock[],
  articleTitle: string,
): { blocks: ContentBlock[]; warnings: string[] } {
  let blocks: ContentBlock[] = rawBlocks.map((b, i) => {
    const { page: _page, ...rest } = b;
    return { ...rest, id: `b${i + 1}` } as ContentBlock;
  });

  blocks = normalizeTens(blocks);

  const { blocks: fixedBlocks, fixes } = autoFixContentBlocks(blocks);
  if (fixes.length > 0) blocks = fixedBlocks;

  const { blocks: auctionFixed } = autoFixAuctions(blocks);
  blocks = auctionFixed;

  const { blocks: noBoilerplate } = stripBoilerplateBlocks(blocks);
  blocks = noBoilerplate;

  const { blocks: noCrossRef } = stripCrossReferences(blocks);
  blocks = noCrossRef;

  if (isProblemArticle(articleTitle)) {
    const interleave = interleaveProblemSolutions(blocks);
    blocks = interleave.blocks;
  }

  const blockErrors = validateContentBlocks(blocks);
  const warnings: string[] = [];
  for (const be of blockErrors) {
    for (const e of be.errors) {
      warnings.push(`Block ${be.blockIndex} (${be.blockType}): ${e}`);
    }
  }

  return { blocks, warnings };
}

// ── Group assignment helper (pure) ───────────────────────────────────────

/** Move block indices between article groups. Empty newTitle = unassign. */
function applyAssignments(
  prev: Map<string, number[]>,
  blockIndices: number[],
  newTitle: string,
): Map<string, number[]> {
  const toMove = new Set(blockIndices);
  const next = new Map<string, number[]>();

  // Copy all groups, removing blocks that are being moved
  prev.forEach((indices, title) => {
    const filtered = indices.filter((i) => !toMove.has(i));
    if (filtered.length > 0) {
      next.set(title, filtered);
    }
  });

  // Add to new group
  if (newTitle) {
    const existing = next.get(newTitle) || [];
    const existingSet = new Set(existing);
    const toAdd = blockIndices.filter((i) => !existingSet.has(i));
    next.set(newTitle, [...existing, ...toAdd]);
  }

  return next;
}

// ── BlockCard component ──────────────────────────────────────────────────

const BlockCard = React.memo(function BlockCard({
  block,
  index,
  assignment,
  color,
  isSelected,
  articles,
  canMoveUp,
  canMoveDown,
  onAssign,
  onDelete,
  onMove,
  onClick,
}: {
  block: PageAnnotatedBlock;
  index: number;
  assignment: string | undefined;
  color: ArticleColor | null;
  isSelected: boolean;
  articles: TocArticleInfo[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAssign: (index: number, title: string) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onClick: (index: number, shiftKey: boolean) => void;
}) {
  return (
    <div
      className={`border-l-4 ${color ? `${color.border} ${color.bg}` : "border-l-stone-300"} ${
        isSelected ? "ring-2 ring-blue-400 ring-inset" : ""
      } cursor-pointer transition-colors`}
      onClick={(e) => onClick(index, e.shiftKey)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="font-mono text-xs bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded shrink-0">
          p.{block.page}
        </span>
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
            TYPE_BADGE_COLORS[block.type] || "bg-stone-100 text-stone-600"
          }`}
        >
          {block.type}
        </span>
        <span className="font-mono text-xs text-stone-400 shrink-0">#{index}</span>
        <div className="flex-1" />

        {/* Move up/down (only when assigned) */}
        {assignment && (
          <div className="flex flex-col shrink-0 -my-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); onMove(index, "up"); }}
              disabled={!canMoveUp}
              className={`text-[10px] leading-none px-1 py-0.5 transition-colors ${
                canMoveUp ? "text-stone-400 hover:text-stone-700" : "text-stone-200 cursor-default"
              }`}
              title="Move up"
            >
              ▲
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMove(index, "down"); }}
              disabled={!canMoveDown}
              className={`text-[10px] leading-none px-1 py-0.5 transition-colors ${
                canMoveDown ? "text-stone-400 hover:text-stone-700" : "text-stone-200 cursor-default"
              }`}
              title="Move down"
            >
              ▼
            </button>
          </div>
        )}

        <select
          value={assignment || ""}
          onChange={(e) => {
            e.stopPropagation();
            onAssign(index, e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          className="font-sans text-xs border border-stone-300 rounded px-2 py-1 bg-white max-w-[280px] truncate"
        >
          <option value="">— Unassigned —</option>
          {articles.map((a) => (
            <option key={a.title} value={a.title}>
              {a.title} (p.{a.source_page})
            </option>
          ))}
        </select>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(index);
          }}
          className="text-stone-300 hover:text-red-500 transition-colors px-1 shrink-0"
          title="Delete block"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Full block render */}
      <div className="px-4 pb-3">
        <div className="border border-stone-200 rounded bg-white p-3 text-sm overflow-hidden">
          <SupabaseArticleRenderer blocks={[block as unknown as ContentBlock]} />
        </div>
      </div>
    </div>
  );
});

// ── Component ────────────────────────────────────────────────────────────

export default function SplitClient() {
  const [transcription, setTranscription] = useState<FullTranscription | null>(null);
  // article title → ordered block indices (source of truth for assignment + order)
  const [articleGroups, setArticleGroups] = useState<Map<string, number[]>>(new Map());
  const [deletedBlocks, setDeletedBlocks] = useState<Set<number>>(new Set());
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [bulkArticle, setBulkArticle] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [loadError, setLoadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File loading ──────────────────────────────────────────────────────

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as FullTranscription;
        if (!data.issue || !Array.isArray(data.blocks) || !Array.isArray(data.articles)) {
          setLoadError("Invalid transcription file: missing issue, blocks, or articles.");
          return;
        }
        setTranscription(data);
        setArticleGroups(new Map());
        setDeletedBlocks(new Set());
        setSelectionStart(null);
        setSelectionEnd(null);
        setBulkArticle("");
        setImportResults([]);
        setLoadError("");
      } catch {
        setLoadError("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
  }, []);

  // ── Derived: color map ────────────────────────────────────────────────

  const articleColorMap = useMemo(() => {
    if (!transcription) return new Map<string, ArticleColor>();
    const map = new Map<string, ArticleColor>();
    transcription.articles.forEach((a, i) => {
      map.set(a.title, COLOR_PALETTE[i % COLOR_PALETTE.length]);
    });
    return map;
  }, [transcription]);

  // ── Derived: assigned set + unassigned indices ────────────────────────

  const assignedIndices = useMemo(() => {
    const set = new Set<number>();
    articleGroups.forEach((indices) => {
      indices.forEach((idx) => set.add(idx));
    });
    return set;
  }, [articleGroups]);

  const unassignedIndices = useMemo(() => {
    if (!transcription) return [];
    return transcription.blocks
      .map((_, i) => i)
      .filter((i) => !deletedBlocks.has(i) && !assignedIndices.has(i));
  }, [transcription, deletedBlocks, assignedIndices]);

  // ── Derived: counts ───────────────────────────────────────────────────

  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    articleGroups.forEach((indices, title) => {
      counts.set(title, indices.length);
    });
    return counts;
  }, [articleGroups]);

  // ── Assignment helpers ────────────────────────────────────────────────

  const assignBlock = useCallback((blockIdx: number, newTitle: string) => {
    setArticleGroups((prev) => applyAssignments(prev, [blockIdx], newTitle));
  }, []);

  const handleBlockClick = useCallback((index: number, shiftKey: boolean) => {
    if (shiftKey && selectionStart !== null) {
      setSelectionEnd(index);
    } else {
      setSelectionStart(index);
      setSelectionEnd(null);
    }
  }, [selectionStart]);

  // ── Selection range ───────────────────────────────────────────────────

  const selectedRange = useMemo((): Set<number> => {
    if (selectionStart === null) return new Set();
    if (selectionEnd === null) return new Set([selectionStart]);
    const lo = Math.min(selectionStart, selectionEnd);
    const hi = Math.max(selectionStart, selectionEnd);
    const set = new Set<number>();
    for (let i = lo; i <= hi; i++) {
      if (!deletedBlocks.has(i)) set.add(i);
    }
    return set;
  }, [selectionStart, selectionEnd, deletedBlocks]);

  const handleBulkAssign = useCallback(() => {
    if (!bulkArticle || selectedRange.size === 0) return;
    setArticleGroups((prev) =>
      applyAssignments(prev, Array.from(selectedRange), bulkArticle),
    );
    setSelectionStart(null);
    setSelectionEnd(null);
    setBulkArticle("");
  }, [bulkArticle, selectedRange]);

  const handleBulkClear = useCallback(() => {
    if (selectedRange.size === 0) return;
    setArticleGroups((prev) =>
      applyAssignments(prev, Array.from(selectedRange), ""),
    );
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [selectedRange]);

  // ── Delete ────────────────────────────────────────────────────────────

  const deleteBlock = useCallback((index: number) => {
    setDeletedBlocks((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setArticleGroups((prev) => applyAssignments(prev, [index], ""));
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedRange.size === 0) return;
    const indices = Array.from(selectedRange);
    setDeletedBlocks((prev) => {
      const next = new Set(prev);
      indices.forEach((idx) => next.add(idx));
      return next;
    });
    setArticleGroups((prev) => applyAssignments(prev, indices, ""));
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [selectedRange]);

  // ── Move within group ─────────────────────────────────────────────────

  const moveBlockInGroup = useCallback((blockIdx: number, direction: "up" | "down") => {
    setArticleGroups((prev) => {
      for (const [title, indices] of Array.from(prev)) {
        const pos = indices.indexOf(blockIdx);
        if (pos === -1) continue;
        const swapPos = direction === "up" ? pos - 1 : pos + 1;
        if (swapPos < 0 || swapPos >= indices.length) return prev;
        const next = new Map(prev);
        const newIndices = [...indices];
        [newIndices[pos], newIndices[swapPos]] = [newIndices[swapPos], newIndices[pos]];
        next.set(title, newIndices);
        return next;
      }
      return prev;
    });
  }, []);

  // ── Auto-assign logic ─────────────────────────────────────────────────

  const handleAutoAssign = useCallback(() => {
    if (!transcription) return;
    const next = new Map<string, number[]>();
    for (let i = 0; i < transcription.blocks.length; i++) {
      if (deletedBlocks.has(i)) continue;
      const block = transcription.blocks[i];
      if (block.page === 0) continue;

      const candidates: TocArticleInfo[] = [];
      for (const article of transcription.articles) {
        for (const [rangeStart, rangeEnd] of article.pdf_pages) {
          if (block.page >= rangeStart && block.page <= rangeEnd) {
            candidates.push(article);
            break;
          }
        }
      }

      let bestTitle = "";
      if (candidates.length === 1) {
        bestTitle = candidates[0].title;
      } else if (candidates.length > 1) {
        let best = candidates[0];
        let bestDist = Math.abs(block.page - best.source_page);
        for (let c = 1; c < candidates.length; c++) {
          const dist = Math.abs(block.page - candidates[c].source_page);
          if (dist < bestDist) {
            best = candidates[c];
            bestDist = dist;
          }
        }
        bestTitle = best.title;
      }

      if (bestTitle) {
        if (!next.has(bestTitle)) next.set(bestTitle, []);
        next.get(bestTitle)!.push(i);
      }
    }
    setArticleGroups(next);
  }, [transcription, deletedBlocks]);

  // ── Import flow ───────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!transcription) return;

    if (unassignedIndices.length > 0) {
      const ok = window.confirm(
        `${unassignedIndices.length} block(s) are unassigned and will be skipped. Continue?`,
      );
      if (!ok) return;
    }

    setImporting(true);
    setImportResults([]);
    const results: ImportResult[] = [];

    try {
      // Step 1: Create/find issue
      const issueRes = await fetch("/api/admin/import/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: transcription.issue.title,
          slug: slugify(transcription.issue.title),
          month: transcription.issue.month,
          year: transcription.issue.year,
          volume: transcription.issue.volume,
          number: transcription.issue.number,
        }),
      });

      if (!issueRes.ok) {
        const err = await issueRes.json();
        results.push({ title: "Issue creation", ok: false, error: err.error });
        setImportResults(results);
        setImporting(false);
        return;
      }

      const { id: issueId } = await issueRes.json();

      // Step 2: Build article payloads in TOC order, using group ordering
      const articlePayloads: Array<Record<string, unknown>> = [];

      for (const tocArticle of transcription.articles) {
        const blockIndices = articleGroups.get(tocArticle.title);
        if (!blockIndices || blockIndices.length === 0) continue;

        const rawBlocks = blockIndices.map((i) => transcription.blocks[i]);

        const { blocks: processed, warnings } = postProcessBlocks(
          rawBlocks,
          tocArticle.title,
        );

        if (warnings.length > 0) {
          console.log(`[split] "${tocArticle.title}": ${warnings.length} warning(s)`);
        }

        const { title: cleanTitle, extractedAuthor } = stripAuthorFromTitle(
          tocArticle.title,
          tocArticle.author_name || undefined,
        );
        const authorName = tocArticle.author_name || extractedAuthor || "";
        const category = mapCategory(tocArticle.category) || tocArticle.category;
        const level = inferLevel(category, tocArticle.tags);

        articlePayloads.push({
          title: cleanTitle,
          slug: truncateSlug(slugify(cleanTitle)),
          author_name: authorName,
          category,
          tags: tocArticle.tags,
          level,
          month: transcription.issue.month,
          year: transcription.issue.year,
          source_page: tocArticle.source_page,
          excerpt: tocArticle.excerpt,
          content_blocks: processed,
          issue_id: issueId,
        });
      }

      // Step 3: Batch import
      const batchRes = await fetch("/api/admin/import/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articles: articlePayloads, issueId }),
      });

      if (!batchRes.ok) {
        const err = await batchRes.json();
        results.push({ title: "Batch import", ok: false, error: err.error });
      } else {
        const batchData = await batchRes.json();
        for (const art of batchData.articles as Array<{ title: string }>) {
          results.push({ title: art.title, ok: true });
        }
      }
    } catch (err) {
      results.push({
        title: "Import",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    setImportResults(results);
    setImporting(false);
  }, [transcription, articleGroups, unassignedIndices]);

  // ── Render: file loader ───────────────────────────────────────────────

  if (!transcription) {
    return (
      <div className="bg-white border border-stone-200 rounded-sm p-6">
        <label className="block font-sans text-sm font-medium text-stone-700 mb-2">
          Load full-transcription JSON
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileLoad}
          className="font-sans text-sm"
        />
        {loadError && (
          <p className="font-sans text-sm text-red-600 mt-2">{loadError}</p>
        )}
      </div>
    );
  }

  const blocks = transcription.blocks;
  const hasSelection = selectedRange.size > 1;

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* ── Sticky toolbar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border border-stone-200 rounded-sm mb-2 shadow-sm">
        {/* Issue info bar */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-stone-100">
          <div>
            <p className="font-serif text-lg font-bold text-stone-900">
              {transcription.issue.title}
            </p>
            <p className="font-sans text-sm text-stone-500">
              {blocks.length} blocks &middot; {transcription.articles.length} TOC articles
              &middot; {assignedIndices.size} assigned &middot; {unassignedIndices.length} unassigned
              {deletedBlocks.size > 0 && <> &middot; <span className="text-red-500">{deletedBlocks.size} deleted</span></>}
              &middot; ${transcription.stats.costUsd.toFixed(2)}
            </p>
          </div>
          <button
            onClick={() => {
              setTranscription(null);
              setArticleGroups(new Map());
              setDeletedBlocks(new Set());
              setSelectionStart(null);
              setSelectionEnd(null);
              setImportResults([]);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="font-sans text-sm text-stone-500 hover:text-stone-700"
          >
            Clear
          </button>
        </div>

        {/* Article legend */}
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-stone-100">
          {transcription.articles.map((a) => {
            const color = articleColorMap.get(a.title);
            const count = assignmentCounts.get(a.title) || 0;
            return (
              <span
                key={a.title}
                className="inline-flex items-center gap-1.5 text-xs font-sans text-stone-600"
                title={`${a.title} — ${count} blocks`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${color?.dot || "bg-stone-300"}`} />
                <span className="truncate max-w-[160px]">{a.title}</span>
                <span className="text-stone-400">({count})</span>
              </span>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="px-4 py-2 flex items-center gap-3">
          <button
            onClick={handleAutoAssign}
            className="font-sans text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors"
          >
            Auto-assign
          </button>
          <button
            onClick={() => {
              setArticleGroups(new Map());
              setSelectionStart(null);
              setSelectionEnd(null);
            }}
            className="font-sans text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors"
          >
            Clear All
          </button>
          <div className="flex-1" />
          <button
            onClick={handleImport}
            disabled={assignedIndices.size === 0 || importing}
            className={`font-sans text-sm px-6 py-2 transition-colors rounded ${
              assignedIndices.size > 0 && !importing
                ? "bg-stone-900 text-white hover:bg-stone-700"
                : "bg-stone-200 text-stone-400 cursor-not-allowed"
            }`}
          >
            {importing ? "Importing..." : "Import All"}
          </button>
        </div>
      </div>

      {/* ── Scrollable grouped block list ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-20">

        {/* Article sections in TOC order */}
        {transcription.articles.map((article) => {
          const indices = articleGroups.get(article.title);
          if (!indices || indices.length === 0) return null;
          const color = articleColorMap.get(article.title);
          return (
            <div key={article.title} className="mb-4">
              {/* Section header */}
              <div className="sticky top-0 z-[5] flex items-center gap-2 px-4 py-2.5 bg-white border-y border-stone-200 shadow-sm">
                <span className={`w-3 h-3 rounded-full shrink-0 ${color?.dot || "bg-stone-300"}`} />
                <span className="font-serif text-sm font-bold text-stone-900 truncate">
                  {article.title}
                </span>
                {article.author_name && (
                  <span className="font-sans text-xs text-stone-400 shrink-0">
                    by {article.author_name}
                  </span>
                )}
                <span className="font-sans text-xs text-stone-400 shrink-0">
                  ({indices.length} block{indices.length !== 1 ? "s" : ""})
                </span>
              </div>
              {/* Blocks in group order */}
              <div className="space-y-1 mt-1">
                {indices.map((blockIdx, posInGroup) => {
                  const block = blocks[blockIdx];
                  return (
                    <BlockCard
                      key={block.id}
                      block={block}
                      index={blockIdx}
                      assignment={article.title}
                      color={color || null}
                      isSelected={selectedRange.has(blockIdx)}
                      articles={transcription.articles}
                      canMoveUp={posInGroup > 0}
                      canMoveDown={posInGroup < indices.length - 1}
                      onAssign={assignBlock}
                      onDelete={deleteBlock}
                      onMove={moveBlockInGroup}
                      onClick={handleBlockClick}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Unassigned section */}
        {unassignedIndices.length > 0 && (
          <div className="mb-4">
            <div className="sticky top-0 z-[5] flex items-center gap-2 px-4 py-2.5 bg-stone-100 border-y border-stone-200 shadow-sm">
              <span className="w-3 h-3 rounded-full shrink-0 bg-stone-400" />
              <span className="font-sans text-sm font-bold text-stone-600">Unassigned</span>
              <span className="font-sans text-xs text-stone-400">
                ({unassignedIndices.length} block{unassignedIndices.length !== 1 ? "s" : ""})
              </span>
            </div>
            <div className="space-y-1 mt-1">
              {unassignedIndices.map((blockIdx) => {
                const block = blocks[blockIdx];
                return (
                  <BlockCard
                    key={block.id}
                    block={block}
                    index={blockIdx}
                    assignment={undefined}
                    color={null}
                    isSelected={selectedRange.has(blockIdx)}
                    articles={transcription.articles}
                    canMoveUp={false}
                    canMoveDown={false}
                    onAssign={assignBlock}
                    onDelete={deleteBlock}
                    onMove={moveBlockInGroup}
                    onClick={handleBlockClick}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Floating bulk toolbar ──────────────────────────────────────── */}
      {hasSelection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 bg-white border border-stone-300 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <span className="font-sans text-sm font-medium text-stone-700">
            {selectedRange.size} blocks selected
          </span>
          <select
            value={bulkArticle}
            onChange={(e) => setBulkArticle(e.target.value)}
            className="font-sans text-sm border border-stone-300 rounded px-2 py-1 bg-white min-w-[200px]"
          >
            <option value="">— Select article —</option>
            {transcription.articles.map((a) => (
              <option key={a.title} value={a.title}>
                {a.title} (p.{a.source_page})
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={!bulkArticle}
            className={`font-sans text-sm px-4 py-1.5 rounded transition-colors ${
              bulkArticle
                ? "bg-stone-900 text-white hover:bg-stone-700"
                : "bg-stone-200 text-stone-400 cursor-not-allowed"
            }`}
          >
            Assign
          </button>
          <button
            onClick={handleBulkClear}
            className="font-sans text-sm px-3 py-1.5 text-stone-500 hover:text-stone-700 transition-colors"
          >
            Unassign
          </button>
          <button
            onClick={handleBulkDelete}
            className="font-sans text-sm px-3 py-1.5 text-red-500 hover:text-red-700 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => {
              setSelectionStart(null);
              setSelectionEnd(null);
            }}
            className="font-sans text-sm px-2 py-1.5 text-stone-400 hover:text-stone-600 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Import results ─────────────────────────────────────────────── */}
      {importResults.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 mt-2">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Import Results
          </p>
          <ul className="font-sans text-sm space-y-1">
            {importResults.map((r, i) => (
              <li key={i} className={r.ok ? "text-green-700" : "text-red-600"}>
                {r.ok ? "\u2713" : "\u2717"} {r.title}
                {r.error && ` — ${r.error}`}
              </li>
            ))}
          </ul>
          <p className="font-sans text-sm text-stone-500 mt-2">
            {importResults.filter((r) => r.ok).length}/{importResults.length} articles created successfully
          </p>
        </div>
      )}
    </div>
  );
}
