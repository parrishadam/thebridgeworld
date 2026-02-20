"use client";

import { useState } from "react";
import type { SubscriptionTier } from "@/types";

interface AdminUser {
  user_id:    string;
  tier:       SubscriptionTier;
  is_admin:   boolean;
  created_at: string;
  name:       string;
  email:      string;
  imageUrl?:  string;
  first_name?: string | null;
  last_name?:  string | null;
}

const TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

const tierBadge: Record<SubscriptionTier, string> = {
  free:    "bg-stone-100 text-stone-600",
  paid:    "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
};

interface AddForm { firstName: string; lastName: string; email: string; tier: SubscriptionTier }
interface EditForm { firstName: string; lastName: string; email: string }

export default function UserTierTable({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);

  // ── Tier-change state ─────────────────────────────────────────────────────
  const [tierSaving, setTierSaving] = useState<string | null>(null);
  const [tierError,  setTierError]  = useState<string | null>(null);

  // ── Add-user state ────────────────────────────────────────────────────────
  const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState<AddForm>({ firstName: "", lastName: "", email: "", tier: "free" });
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  // ── Row-edit state ────────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState<EditForm>({ firstName: "", lastName: "", email: "" });
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleTierChange(userId: string, newTier: SubscriptionTier) {
    setTierSaving(userId);
    setTierError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/tier`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tier: newTier }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, tier: updated.tier } : u));
    } catch (err) {
      setTierError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTierSaving(null);
    }
  }

  async function handleAddUser() {
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(addForm),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Failed to add user");
      }
      const newUser = await res.json();
      setUsers((prev) => [newUser, ...prev]);
      setAddForm({ firstName: "", lastName: "", email: "", tier: "free" });
      setShowAdd(false);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 5000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAddSaving(false);
    }
  }

  function startEdit(user: AdminUser) {
    setEditingId(user.user_id);
    setEditError(null);
    setEditForm({
      firstName: user.first_name ?? "",
      lastName:  user.last_name  ?? "",
      email:     user.email !== "—" ? user.email : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(userId: string) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/profile`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(editForm),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      const newName = [editForm.firstName.trim(), editForm.lastName.trim()].filter(Boolean).join(" ") || "—";
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, name: newName, email: editForm.email.trim() || u.email,
                first_name: editForm.firstName.trim() || null,
                last_name:  editForm.lastName.trim()  || null }
            : u
        )
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Shared input className ─────────────────────────────────────────────────

  const inputCls = "border border-stone-200 rounded px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Add User form ── */}
      <div className="mb-6">
        {!showAdd ? (
          <button
            onClick={() => { setShowAdd(true); setAddError(null); }}
            className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
          >
            + Add User
          </button>
        ) : (
          <div className="border border-stone-200 rounded-sm bg-stone-50 p-5 space-y-4">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
              Add Manual User
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-sans text-stone-500 mb-1">First name</label>
                <input
                  type="text"
                  value={addForm.firstName}
                  onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-sans text-stone-500 mb-1">Last name</label>
                <input
                  type="text"
                  value={addForm.lastName}
                  onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-sans text-stone-500 mb-1">Email address</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-sans text-stone-500 mb-1">Tier</label>
                <select
                  value={addForm.tier}
                  onChange={(e) => setAddForm((f) => ({ ...f, tier: e.target.value as SubscriptionTier }))}
                  className={inputCls}
                >
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {addError && (
              <p className="text-xs font-sans text-red-600">{addError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddUser}
                disabled={addSaving || !addForm.email.trim()}
                className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addSaving ? "Adding…" : "Add User"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddError(null); }}
                className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {addSuccess && (
          <div className="mt-3 bg-green-50 border border-green-200 text-green-800 text-sm font-sans px-4 py-3 rounded-sm">
            ✓ User added successfully.
          </div>
        )}
      </div>

      {/* ── Global errors ── */}
      {tierError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm font-sans px-4 py-3 rounded-sm">
          {tierError}
        </div>
      )}

      {/* ── User table ── */}
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left">
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">User</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">ID</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Tier</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Admin</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Since</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((user) => {
              const isEditing = editingId === user.user_id;
              return (
                <tr key={user.user_id} className={isEditing ? "bg-stone-50" : ""}>

                  {/* ── User info cell ── */}
                  <td className="py-3 pr-6">
                    {isEditing ? (
                      <div className="space-y-1.5 min-w-[220px]">
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={editForm.firstName}
                            onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                            placeholder="First name"
                            className="border border-stone-200 rounded px-2 py-1 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full"
                          />
                          <input
                            type="text"
                            value={editForm.lastName}
                            onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                            placeholder="Last name"
                            className="border border-stone-200 rounded px-2 py-1 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full"
                          />
                        </div>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          placeholder="Email address"
                          className="border border-stone-200 rounded px-2 py-1 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full"
                        />
                        {editError && (
                          <p className="text-xs text-red-600">{editError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {user.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.imageUrl}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover bg-stone-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-semibold text-stone-500 flex-shrink-0">
                            {user.name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900 truncate">{user.name}</p>
                          <p className="text-stone-400 text-xs truncate">{user.email}</p>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* ── ID ── */}
                  <td className="py-3 pr-6">
                    <code className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                      {user.user_id}
                    </code>
                  </td>

                  {/* ── Tier ── */}
                  <td className="py-3 pr-6">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${tierBadge[user.tier]}`}>
                        {user.tier}
                      </span>
                      <select
                        value={user.tier}
                        disabled={tierSaving === user.user_id}
                        onChange={(e) => handleTierChange(user.user_id, e.target.value as SubscriptionTier)}
                        className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600 bg-white hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-50"
                      >
                        {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {tierSaving === user.user_id && (
                        <span className="text-xs text-stone-400">Saving…</span>
                      )}
                    </div>
                  </td>

                  {/* ── Admin badge ── */}
                  <td className="py-3 pr-6">
                    {user.is_admin && (
                      <span className="text-xs bg-rose-100 text-rose-700 font-medium px-2 py-0.5 rounded uppercase tracking-wide">
                        Admin
                      </span>
                    )}
                  </td>

                  {/* ── Since ── */}
                  <td className="py-3 pr-6 text-stone-400 text-xs">
                    {new Date(user.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>

                  {/* ── Actions ── */}
                  <td className="py-3">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditSave(user.user_id)}
                          disabled={editSaving}
                          className="font-sans text-xs bg-stone-900 text-white px-3 py-1.5 rounded hover:bg-stone-700 transition-colors disabled:opacity-40"
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editSaving}
                          className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 transition-colors disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(user)}
                        className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-400 font-sans italic">
            No users yet — profiles are created on first sign-in, or add one manually above.
          </p>
        )}
      </div>
    </>
  );
}
