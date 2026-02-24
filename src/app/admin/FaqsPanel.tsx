"use client";

import { useState } from "react";

interface Faq {
  id:           string;
  question:     string;
  answer:       string;
  sort_order:   number;
  is_published: boolean;
  created_at:   string;
  updated_at:   string;
}

interface Props {
  initialFaqs: Faq[];
}

interface FaqForm {
  question:     string;
  answer:       string;
  sort_order:   string;
  is_published: boolean;
}

const EMPTY_FORM: FaqForm = { question: "", answer: "", sort_order: "0", is_published: true };

export default function FaqsPanel({ initialFaqs }: Props) {
  const [faqs,       setFaqs]       = useState<Faq[]>(initialFaqs);
  const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState<FaqForm>(EMPTY_FORM);
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState<string | null>(null);

  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<FaqForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const inputCls = "border border-stone-200 rounded px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full";

  // ── Add ───────────────────────────────────────────────────────────────────

  async function handleAdd() {
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/faqs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          question:     addForm.question.trim(),
          answer:       addForm.answer.trim(),
          sort_order:   parseInt(addForm.sort_order, 10) || 0,
          is_published: addForm.is_published,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Failed to create FAQ");
      }
      const created = await res.json();
      setFaqs((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAddSaving(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function startEdit(faq: Faq) {
    setEditingId(faq.id);
    setEditError(null);
    setEditForm({
      question:     faq.question,
      answer:       faq.answer,
      sort_order:   String(faq.sort_order),
      is_published: faq.is_published,
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
      const res = await fetch(`/api/faqs/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          question:     editForm.question.trim(),
          answer:       editForm.answer.trim(),
          sort_order:   parseInt(editForm.sort_order, 10) || 0,
          is_published: editForm.is_published,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      const updated = await res.json();
      setFaqs((prev) =>
        prev
          .map((f) => (f.id === id ? updated : f))
          .sort((a, b) => a.sort_order - b.sort_order),
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string, question: string) {
    const truncated = question.length > 60 ? question.slice(0, 60) + "…" : question;
    if (!confirm(`Delete FAQ "${truncated}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/faqs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Delete failed");
      }
      setFaqs((prev) => prev.filter((f) => f.id !== id));
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
          + Add FAQ
        </button>
      ) : (
        <div className="border border-stone-200 rounded-sm bg-stone-50 p-5 space-y-4">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
            New FAQ
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Question <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={addForm.question}
                onChange={(e) => setAddForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="What is The Bridge World?"
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-sans text-stone-500 mb-1">Answer <span className="text-red-500">*</span></label>
              <textarea
                value={addForm.answer}
                onChange={(e) => setAddForm((f) => ({ ...f, answer: e.target.value }))}
                placeholder="The answer to the question…"
                rows={4}
                className={inputCls + " resize-y"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.is_published}
                    onChange={(e) => setAddForm((f) => ({ ...f, is_published: e.target.checked }))}
                    className="rounded border-stone-300"
                  />
                  <span className="text-sm font-sans text-stone-600">Published</span>
                </label>
              </div>
            </div>
          </div>
          {addError && <p className="text-xs font-sans text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={addSaving || !addForm.question.trim() || !addForm.answer.trim()}
              className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {addSaving ? "Saving…" : "Add FAQ"}
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

      {/* ── FAQ list ── */}
      <div className="divide-y divide-stone-100">
        {faqs.length === 0 && (
          <p className="py-6 text-sm font-sans text-stone-400 italic">No FAQs yet.</p>
        )}
        {faqs.map((faq) => {
          const isEditing = editingId === faq.id;
          return (
            <div key={faq.id} className={`py-4 ${isEditing ? "bg-stone-50 -mx-6 px-6 rounded-sm" : ""}`}>
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-sans text-stone-500 mb-1">Question <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editForm.question}
                      onChange={(e) => setEditForm((f) => ({ ...f, question: e.target.value }))}
                      className={inputCls}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-sans text-stone-500 mb-1">Answer <span className="text-red-500">*</span></label>
                    <textarea
                      value={editForm.answer}
                      onChange={(e) => setEditForm((f) => ({ ...f, answer: e.target.value }))}
                      rows={4}
                      className={inputCls + " resize-y"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.is_published}
                          onChange={(e) => setEditForm((f) => ({ ...f, is_published: e.target.checked }))}
                          className="rounded border-stone-300"
                        />
                        <span className="text-sm font-sans text-stone-600">Published</span>
                      </label>
                    </div>
                  </div>
                  {editError && <p className="text-xs font-sans text-red-600">{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditSave(faq.id)}
                      disabled={editSaving || !editForm.question.trim() || !editForm.answer.trim()}
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
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-sans text-sm font-medium text-stone-900 truncate">
                        {faq.question}
                      </p>
                      <span className="font-sans text-xs text-stone-400 shrink-0">#{faq.sort_order}</span>
                      {!faq.is_published && (
                        <span className="font-sans text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="font-sans text-xs text-stone-400 truncate mt-0.5">
                      {faq.answer}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(faq)}
                      className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(faq.id, faq.question)}
                      disabled={deletingId === faq.id}
                      className="font-sans text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === faq.id ? "…" : "Delete"}
                    </button>
                  </div>
                  {deleteError?.id === faq.id && (
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
