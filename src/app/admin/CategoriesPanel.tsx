"use client";

import { useState } from "react";
import type { Category } from "@/types";

interface CategoryWithCount extends Category {
  article_count: number;
}

interface Props {
  initialCategories: CategoryWithCount[];
}

interface CategoryForm {
  name:        string;
  description: string;
  color:       string;
  sort_order:  string;
}

const EMPTY_FORM: CategoryForm = { name: "", description: "", color: "#2563eb", sort_order: "0" };

function ColorSwatch({ color }: { color: string | null }) {
  if (!color) return <span className="w-4 h-4 rounded-sm bg-stone-200 inline-block" />;
  return <span className="w-4 h-4 rounded-sm inline-block border border-black/10" style={{ backgroundColor: color }} />;
}

export default function CategoriesPanel({ initialCategories }: Props) {
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories);
  const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState<CategoryForm>(EMPTY_FORM);
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState<string | null>(null);

  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<CategoryForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const inputCls = "border border-stone-200 rounded px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full";

  // ── Add ───────────────────────────────────────────────────────────────────

  async function handleAdd() {
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/categories", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        addForm.name.trim(),
          description: addForm.description.trim() || null,
          color:       addForm.color || null,
          sort_order:  parseInt(addForm.sort_order, 10) || 0,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Failed to create category");
      }
      const created = await res.json();
      setCategories((prev) => [...prev, { ...created, article_count: 0 }]
        .sort((a, b) => a.sort_order - b.sort_order));
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAddSaving(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function startEdit(cat: CategoryWithCount) {
    setEditingId(cat.id);
    setEditError(null);
    setEditForm({
      name:        cat.name,
      description: cat.description ?? "",
      color:       cat.color ?? "#2563eb",
      sort_order:  String(cat.sort_order),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(id: string) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        editForm.name.trim(),
          description: editForm.description.trim() || null,
          color:       editForm.color || null,
          sort_order:  parseInt(editForm.sort_order, 10) || 0,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      const updated = await res.json();
      setCategories((prev) =>
        prev
          .map((c) => c.id === id ? { ...updated, article_count: c.article_count } : c)
          .sort((a, b) => a.sort_order - b.sort_order)
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Delete failed");
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setDeleteError({ id, message: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Add form ── */}
      {!showAdd ? (
        <button
          onClick={() => { setShowAdd(true); setAddError(null); }}
          className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
        >
          + Add Category
        </button>
      ) : (
        <div className="border border-stone-200 rounded-sm bg-stone-50 p-5 space-y-4">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
            New Category
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Bidding Systems"
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Sort order</label>
              <input
                type="number"
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: e.target.value }))}
                className={inputCls}
                min={0}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-sans text-stone-500 mb-1">Description</label>
              <input
                type="text"
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={addForm.color}
                  onChange={(e) => setAddForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-9 h-9 rounded border border-stone-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={addForm.color}
                  onChange={(e) => setAddForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="#2563eb"
                  className="border border-stone-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 flex-1"
                />
              </div>
            </div>
          </div>
          {addError && <p className="text-xs font-sans text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={addSaving || !addForm.name.trim()}
              className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {addSaving ? "Saving…" : "Add Category"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddError(null); setAddForm(EMPTY_FORM); }}
              className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Category list ── */}
      <div className="divide-y divide-stone-100">
        {categories.length === 0 && (
          <p className="py-6 text-sm font-sans text-stone-400 italic">No categories yet.</p>
        )}
        {categories.map((cat) => {
          const isEditing = editingId === cat.id;
          return (
            <div key={cat.id} className={`py-4 ${isEditing ? "bg-stone-50 -mx-6 px-6 rounded-sm" : ""}`}>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-sans text-stone-500 mb-1">Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className={inputCls}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-sans text-stone-500 mb-1">Sort order</label>
                      <input
                        type="number"
                        value={editForm.sort_order}
                        onChange={(e) => setEditForm((f) => ({ ...f, sort_order: e.target.value }))}
                        className={inputCls}
                        min={0}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-sans text-stone-500 mb-1">Description</label>
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-sans text-stone-500 mb-1">Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                          className="w-9 h-9 rounded border border-stone-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={editForm.color}
                          onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                          className="border border-stone-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  {editError && <p className="text-xs font-sans text-red-600">{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditSave(cat.id)}
                      disabled={editSaving || !editForm.name.trim()}
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
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <ColorSwatch color={cat.color} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-sans text-sm font-medium text-stone-900">{cat.name}</p>
                      <span className="font-sans text-xs text-stone-400">#{cat.sort_order}</span>
                    </div>
                    {cat.description && (
                      <p className="font-sans text-xs text-stone-400 truncate">{cat.description}</p>
                    )}
                    {cat.article_count > 0 && (
                      <p className="font-sans text-xs text-stone-400">
                        {cat.article_count} {cat.article_count === 1 ? "article" : "articles"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(cat)}
                      className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id, cat.name)}
                      disabled={deletingId === cat.id || cat.article_count > 0}
                      title={cat.article_count > 0
                        ? `Reassign ${cat.article_count} article${cat.article_count === 1 ? "" : "s"} before deleting`
                        : "Delete category"}
                      className="font-sans text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === cat.id ? "…" : "Delete"}
                    </button>
                  </div>
                  {deleteError?.id === cat.id && (
                    <p className="text-xs text-red-600 mt-1">{deleteError.message}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
