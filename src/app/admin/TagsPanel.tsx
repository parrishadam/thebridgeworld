"use client";

import { useState } from "react";
import type { Tag } from "@/types";

interface TagWithCount extends Tag {
  article_count: number;
}

interface Props {
  initialTags: TagWithCount[];
}

export default function TagsPanel({ initialTags }: Props) {
  const [tags,        setTags]        = useState<TagWithCount[]>(initialTags);
  const [showAdd,     setShowAdd]     = useState(false);
  const [addName,     setAddName]     = useState("");
  const [addSaving,   setAddSaving]   = useState(false);
  const [addError,    setAddError]    = useState<string | null>(null);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editName,    setEditName]    = useState("");
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [mergingTag,  setMergingTag]  = useState<TagWithCount | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeError,  setMergeError]  = useState<string | null>(null);

  const inputCls = "border border-stone-200 rounded px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400";

  // ── Add ───────────────────────────────────────────────────────────────────

  async function handleAdd() {
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/tags", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Failed to create tag");
      }
      const created = await res.json();
      // If the tag already existed the API returns 200; avoid duplicates in list
      setTags((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev;
        return [...prev, { ...created, article_count: 0 }]
          .sort((a, b) => a.name.localeCompare(b.name));
      });
      setAddName("");
      setShowAdd(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAddSaving(false);
    }
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  function startEdit(tag: TagWithCount) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleRename(id: string) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Rename failed");
      }
      const updated = await res.json();
      setTags((prev) =>
        prev.map((t) =>
          t.id === id ? { ...updated, article_count: t.article_count } : t
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(tag: TagWithCount) {
    const msg = tag.article_count > 0
      ? `Delete tag "${tag.name}"? It will be removed from ${tag.article_count} article${tag.article_count === 1 ? "" : "s"}. This cannot be undone.`
      : `Delete tag "${tag.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;

    setDeletingId(tag.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        const { error: m } = await res.json();
        throw new Error(m ?? "Delete failed");
      }
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } catch (err) {
      setDeleteError({ id: tag.id, message: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setDeletingId(null);
    }
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  function openMerge(tag: TagWithCount) {
    setMergingTag(tag);
    const firstOther = tags.find((t) => t.id !== tag.id);
    setMergeTarget(firstOther?.id ?? "");
    setMergeError(null);
  }

  async function handleMerge() {
    if (!mergingTag || !mergeTarget) return;
    setMergeSaving(true);
    setMergeError(null);
    const targetTag = tags.find((t) => t.id === mergeTarget);
    try {
      const res = await fetch(`/api/tags/${mergingTag.id}/merge`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ targetId: mergeTarget }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Merge failed");
      }
      const { mergedCount } = await res.json();
      // Remove source, increment target count
      setTags((prev) =>
        prev
          .filter((t) => t.id !== mergingTag.id)
          .map((t) =>
            t.id === mergeTarget
              ? { ...t, article_count: t.article_count + mergedCount }
              : t
          )
      );
      setMergingTag(null);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMergeSaving(false);
    }
    void targetTag; // used in JSX below
  }

  const targetTag = mergingTag ? tags.find((t) => t.id === mergeTarget) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Add form ── */}
      {!showAdd ? (
        <button
          onClick={() => { setShowAdd(true); setAddError(null); }}
          className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
        >
          + Add Tag
        </button>
      ) : (
        <div className="border border-stone-200 rounded-sm bg-stone-50 p-5 space-y-4">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
            New Tag
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setShowAdd(false); setAddName(""); }
              }}
              placeholder="e.g. squeeze"
              className={`${inputCls} flex-1`}
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={addSaving || !addName.trim()}
              className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {addSaving ? "Saving…" : "Add Tag"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddName(""); setAddError(null); }}
              className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          {addError && <p className="text-xs font-sans text-red-600">{addError}</p>}
        </div>
      )}

      {/* ── Tag list ── */}
      <div className="divide-y divide-stone-100">
        {tags.length === 0 && (
          <p className="py-6 text-sm font-sans text-stone-400 italic">No tags yet.</p>
        )}
        {tags.map((tag) => {
          const isEditing = editingId === tag.id;
          return (
            <div key={tag.id} className={`py-3 ${isEditing ? "bg-stone-50 -mx-6 px-6" : ""}`}>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={`${inputCls} flex-1`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(tag.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <button
                    onClick={() => handleRename(tag.id)}
                    disabled={editSaving || !editName.trim()}
                    className="font-sans text-xs bg-stone-900 text-white px-3 py-1.5 rounded hover:bg-stone-700 transition-colors disabled:opacity-40"
                  >
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={editSaving}
                    className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                  {editError && (
                    <span className="text-xs text-red-600 font-sans">{editError}</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-sans text-sm text-stone-900">{tag.name}</span>
                    <span className="ml-2 font-sans text-xs text-stone-400">
                      {tag.article_count} {tag.article_count === 1 ? "article" : "articles"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(tag)}
                      className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => openMerge(tag)}
                      disabled={tags.length < 2}
                      title="Merge this tag into another"
                      className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      disabled={deletingId === tag.id}
                      className="font-sans text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === tag.id ? "…" : "Delete"}
                    </button>
                  </div>
                  {deleteError?.id === tag.id && (
                    <p className="text-xs text-red-600 font-sans mt-1">{deleteError.message}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Merge modal ── */}
      {mergingTag && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => { if (!mergeSaving) setMergingTag(null); }}
        >
          <div
            className="bg-white border border-stone-200 rounded-sm shadow-xl p-6 w-full max-w-md mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Merge Tag
              </p>
              <p className="font-serif text-lg font-bold text-stone-900">
                &ldquo;{mergingTag.name}&rdquo;
              </p>
            </div>

            <p className="font-sans text-sm text-stone-600">
              Choose a tag to merge into. All{" "}
              <strong>{mergingTag.article_count}</strong> article
              {mergingTag.article_count === 1 ? "" : "s"} tagged{" "}
              <em>{mergingTag.name}</em> will become tagged{" "}
              <em>{targetTag?.name ?? "…"}</em>. The tag{" "}
              <em>{mergingTag.name}</em> will be deleted.
            </p>

            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">
                Merge into
              </label>
              <select
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                className={`${inputCls} w-full`}
              >
                {tags
                  .filter((t) => t.id !== mergingTag.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.article_count} article{t.article_count === 1 ? "" : "s"})
                    </option>
                  ))}
              </select>
            </div>

            {mergeError && (
              <p className="text-xs font-sans text-red-600">{mergeError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleMerge}
                disabled={mergeSaving || !mergeTarget}
                className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40"
              >
                {mergeSaving ? "Merging…" : "Confirm Merge"}
              </button>
              <button
                onClick={() => setMergingTag(null)}
                disabled={mergeSaving}
                className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
