"use client";

import { useState } from "react";
import type { SubscriptionTier } from "@/types";

interface AdminUser {
  user_id:     string;
  tier:        SubscriptionTier;
  is_admin:    boolean;
  is_author:   boolean;
  is_legacy:   boolean;
  bio:         string | null;
  created_at:  string;
  name:        string;
  email:       string;
  imageUrl?:   string;
  first_name?: string | null;
  last_name?:  string | null;
}

const TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

const tierBadge: Record<SubscriptionTier, string> = {
  free:    "bg-stone-100 text-stone-600",
  paid:    "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
};

interface AddForm {
  firstName: string;
  lastName:  string;
  email:     string;
  tier:      SubscriptionTier;
  isLegacy:  boolean;
  bio:       string;
}

interface EditForm {
  firstName: string;
  lastName:  string;
  email:     string;
  bio:       string;
}

export default function UserTierTable({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);

  // ── Tier-change state ─────────────────────────────────────────────────────
  const [tierSaving, setTierSaving] = useState<string | null>(null);
  const [tierError,  setTierError]  = useState<string | null>(null);

  // ── Add-user state ────────────────────────────────────────────────────────
  const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState<AddForm>({
    firstName: "", lastName: "", email: "", tier: "free", isLegacy: false, bio: "",
  });
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<{ name: string; email: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // ── Row-edit state ────────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<EditForm>({ firstName: "", lastName: "", email: "", bio: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  // ── Reset-password state ──────────────────────────────────────────────────
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [resetError,  setResetError]  = useState<{ userId: string; message: string } | null>(null);

  // ── Admin-toggle state ────────────────────────────────────────────────────
  const [adminSaving, setAdminSaving] = useState<string | null>(null);
  const [adminError,  setAdminError]  = useState<{ userId: string; message: string } | null>(null);

  // ── Author-toggle state ───────────────────────────────────────────────────
  const [authorSaving, setAuthorSaving] = useState<string | null>(null);
  const [authorError,  setAuthorError]  = useState<{ userId: string; message: string } | null>(null);

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
      const { tempPassword: pw, ...newUser } = await res.json();
      setUsers((prev) => [newUser, ...prev]);
      setTempPassword(pw ?? null);
      setAddSuccess({ name: newUser.name, email: newUser.email });
      setAddForm({ firstName: "", lastName: "", email: "", tier: "free", isLegacy: false, bio: "" });
      setShowAdd(false);
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
      bio:       user.bio ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(userId: string) {
    setEditSaving(true);
    setEditError(null);
    const user = users.find((u) => u.user_id === userId);
    try {
      const body: Record<string, unknown> = { bio: editForm.bio };
      // Legacy authors: only update name + bio (no email, no Clerk sync needed)
      if (!user?.is_legacy) {
        body.firstName = editForm.firstName;
        body.lastName  = editForm.lastName;
        body.email     = editForm.email;
      } else {
        body.firstName = editForm.firstName;
        body.lastName  = editForm.lastName;
      }
      const res = await fetch(`/api/admin/users/${userId}/profile`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      const newName = [editForm.firstName.trim(), editForm.lastName.trim()].filter(Boolean).join(" ") || "—";
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? {
                ...u,
                name:       newName,
                bio:        editForm.bio.trim() || null,
                ...(u.is_legacy ? {} : {
                  email:      editForm.email.trim() || u.email,
                  first_name: editForm.firstName.trim() || null,
                  last_name:  editForm.lastName.trim()  || null,
                }),
                ...(!u.is_legacy ? {} : {
                  first_name: editForm.firstName.trim() || null,
                  last_name:  editForm.lastName.trim()  || null,
                }),
              }
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

  async function handleAdminToggle(userId: string, newValue: boolean) {
    setAdminSaving(userId);
    setAdminError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/profile`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isAdmin: newValue }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, is_admin: newValue } : u));
    } catch (err) {
      setAdminError({ userId, message: err instanceof Error ? err.message : "Update failed" });
    } finally {
      setAdminSaving(null);
    }
  }

  async function handleAuthorToggle(userId: string, newValue: boolean) {
    setAuthorSaving(userId);
    setAuthorError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/profile`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isAuthor: newValue }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, is_author: newValue } : u));
    } catch (err) {
      setAuthorError({ userId, message: err instanceof Error ? err.message : "Update failed" });
    } finally {
      setAuthorSaving(null);
    }
  }

  async function handleResetPassword(userId: string, name: string, email: string) {
    setResettingId(userId);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "PATCH" });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Reset failed");
      }
      const { tempPassword: pw } = await res.json();
      setResetResult({ name, email, tempPassword: pw });
    } catch (err) {
      setResetError({ userId, message: err instanceof Error ? err.message : "Reset failed" });
    } finally {
      setResettingId(null);
    }
  }

  // ── Shared input className ─────────────────────────────────────────────────

  const inputCls = "border border-stone-200 rounded px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Reset Password modal ── */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-sm shadow-xl border border-stone-200 max-w-md w-full mx-4 p-6 space-y-4">
            <p className="font-sans text-sm font-semibold text-stone-900">
              Password reset for {resetResult.name}
            </p>
            <p className="font-sans text-xs text-stone-500">{resetResult.email}</p>
            <p className="font-sans text-xs text-stone-600">
              Share this temporary password with the user — they should change it on first login:
            </p>
            <div className="flex items-center gap-3">
              <code className="bg-stone-50 border border-stone-200 rounded px-3 py-2 font-mono text-base font-bold text-stone-900 tracking-widest select-all flex-1">
                {resetResult.tempPassword}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(resetResult.tempPassword)}
                className="font-sans text-xs border border-stone-300 text-stone-600 px-3 py-2 rounded hover:bg-stone-50 transition-colors whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <p className="font-sans text-xs text-amber-700 italic">
              This password will not be shown again.
            </p>
            <button
              onClick={() => setResetResult(null)}
              className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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
              Add User
            </p>

            {/* Legacy toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={addForm.isLegacy}
                onChange={(e) => setAddForm((f) => ({ ...f, isLegacy: e.target.checked, email: "" }))}
                className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
              />
              <span className="text-sm font-sans text-stone-700">
                Legacy author (no login)
              </span>
            </label>

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
                <label className="block text-xs font-sans text-stone-500 mb-1">
                  Email address{addForm.isLegacy && <span className="text-stone-400 ml-1">(optional)</span>}
                </label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={addForm.isLegacy ? "Optional" : "jane@example.com"}
                  className={inputCls}
                />
              </div>
              {!addForm.isLegacy && (
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
              )}
            </div>

            {/* Bio field — only for legacy authors */}
            {addForm.isLegacy && (
              <div>
                <label className="block text-xs font-sans text-stone-500 mb-1">Bio</label>
                <textarea
                  value={addForm.bio}
                  onChange={(e) => setAddForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Short author biography…"
                  rows={3}
                  className="border border-stone-200 rounded px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full resize-none"
                />
              </div>
            )}

            {addError && (
              <p className="text-xs font-sans text-red-600">{addError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddUser}
                disabled={addSaving || (!addForm.isLegacy && !addForm.email.trim())}
                className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addSaving ? "Adding…" : addForm.isLegacy ? "Add Legacy Author" : "Add User"}
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
          <div className="mt-3 bg-green-50 border border-green-200 rounded-sm p-4 space-y-2">
            <p className="font-sans text-sm font-semibold text-green-800">
              ✓ {addSuccess.email !== "—"
                  ? `Account created for ${addSuccess.name} (${addSuccess.email})`
                  : `Legacy author profile created for ${addSuccess.name}`}
            </p>
            {tempPassword && (
              <>
                <p className="font-sans text-xs text-green-700">
                  Share this temporary password with the user — they should change it on first login:
                </p>
                <div className="flex items-center gap-3">
                  <code className="bg-white border border-green-300 rounded px-3 py-1.5 font-mono text-base font-bold text-green-900 tracking-widest select-all">
                    {tempPassword}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(tempPassword)}
                    className="font-sans text-xs border border-green-300 text-green-700 px-3 py-1.5 rounded hover:bg-green-100 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="font-sans text-xs text-green-600 italic">
                  This password will not be shown again.
                </p>
              </>
            )}
            <button
              onClick={() => { setAddSuccess(null); setTempPassword(null); }}
              className="block font-sans text-xs text-green-600 hover:text-green-900 underline mt-1"
            >
              Dismiss
            </button>
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
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Author</th>
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
                        {!user.is_legacy && (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="Email address"
                            className="border border-stone-200 rounded px-2 py-1 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full"
                          />
                        )}
                        {user.is_legacy && (
                          <textarea
                            value={editForm.bio}
                            onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                            placeholder="Author bio…"
                            rows={3}
                            className="border border-stone-200 rounded px-2 py-1 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-stone-400 w-full resize-none"
                          />
                        )}
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
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-stone-900 truncate">{user.name}</p>
                            {user.is_legacy && (
                              <span className="shrink-0 text-xs font-sans font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                                Legacy
                              </span>
                            )}
                          </div>
                          <p className="text-stone-400 text-xs truncate">{user.email}</p>
                          {user.is_legacy && user.bio && (
                            <p className="text-stone-400 text-xs truncate mt-0.5 italic">{user.bio}</p>
                          )}
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
                      {!user.is_legacy && (
                        <select
                          value={user.tier}
                          disabled={tierSaving === user.user_id}
                          onChange={(e) => handleTierChange(user.user_id, e.target.value as SubscriptionTier)}
                          className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600 bg-white hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-50"
                        >
                          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      )}
                      {tierSaving === user.user_id && (
                        <span className="text-xs text-stone-400">Saving…</span>
                      )}
                    </div>
                  </td>

                  {/* ── Admin toggle ── */}
                  <td className="py-3 pr-6">
                    {!user.is_legacy ? (
                      <div className="flex flex-col gap-1">
                        <label className={`inline-flex items-center gap-2 ${currentUserId === user.user_id ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            checked={user.is_admin}
                            disabled={adminSaving === user.user_id || currentUserId === user.user_id}
                            onChange={(e) => handleAdminToggle(user.user_id, e.target.checked)}
                            className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="text-xs font-sans text-stone-600">
                            {adminSaving === user.user_id ? "Saving…" : "Admin"}
                          </span>
                        </label>
                        {adminError?.userId === user.user_id && (
                          <span className="text-xs text-red-600">{adminError.message}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </td>

                  {/* ── Author toggle ── */}
                  <td className="py-3 pr-6">
                    <div className="flex flex-col gap-1">
                      <label className={`inline-flex items-center gap-2 ${user.is_admin ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          checked={user.is_author || user.is_admin}
                          disabled={authorSaving === user.user_id || user.is_admin}
                          onChange={(e) => handleAuthorToggle(user.user_id, e.target.checked)}
                          className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="text-xs font-sans text-stone-600">
                          {authorSaving === user.user_id ? "Saving…" : "Author"}
                        </span>
                      </label>
                      {authorError?.userId === user.user_id && (
                        <span className="text-xs text-red-600">{authorError.message}</span>
                      )}
                    </div>
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(user)}
                          className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors"
                        >
                          Edit
                        </button>
                        {!user.is_legacy && !user.user_id.startsWith("manual_") && (
                          <button
                            onClick={() => handleResetPassword(user.user_id, user.name, user.email)}
                            disabled={resettingId === user.user_id}
                            className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {resettingId === user.user_id ? "Resetting…" : "Reset Password"}
                          </button>
                        )}
                        {resetError?.userId === user.user_id && (
                          <span className="text-xs text-red-600 self-center">{resetError.message}</span>
                        )}
                      </div>
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
