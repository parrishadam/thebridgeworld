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
}

const TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

const tierBadge: Record<SubscriptionTier, string> = {
  free:    "bg-stone-100 text-stone-600",
  paid:    "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
};

export default function UserTierTable({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers]   = useState<AdminUser[]>(initialUsers);
  const [saving, setSaving] = useState<string | null>(null); // user_id being saved
  const [error, setError]   = useState<string | null>(null);

  async function handleTierChange(userId: string, newTier: SubscriptionTier) {
    setSaving(userId);
    setError(null);

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
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, tier: updated.tier } : u))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(null);
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
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">User</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Clerk ID</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Tier</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium pr-6">Admin</th>
              <th className="pb-3 text-xs uppercase tracking-wider text-stone-400 font-medium">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((user) => (
              <tr key={user.user_id} className="py-3">
                {/* User info */}
                <td className="py-3 pr-6">
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
                      <p className="font-medium text-stone-900 truncate">{user.name || "—"}</p>
                      <p className="text-stone-400 text-xs truncate">{user.email}</p>
                    </div>
                  </div>
                </td>

                {/* Clerk ID */}
                <td className="py-3 pr-6">
                  <code className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                    {user.user_id}
                  </code>
                </td>

                {/* Tier selector */}
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${tierBadge[user.tier]}`}>
                      {user.tier}
                    </span>
                    <select
                      value={user.tier}
                      disabled={saving === user.user_id}
                      onChange={(e) => handleTierChange(user.user_id, e.target.value as SubscriptionTier)}
                      className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600 bg-white hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-50"
                    >
                      {TIERS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {saving === user.user_id && (
                      <span className="text-xs text-stone-400">Saving…</span>
                    )}
                  </div>
                </td>

                {/* Admin badge */}
                <td className="py-3 pr-6">
                  {user.is_admin && (
                    <span className="text-xs bg-rose-100 text-rose-700 font-medium px-2 py-0.5 rounded uppercase tracking-wide">
                      Admin
                    </span>
                  )}
                </td>

                {/* Member since */}
                <td className="py-3 text-stone-400 text-xs">
                  {new Date(user.created_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-400 font-sans italic">
            No users yet — profiles are created on first sign-in.
          </p>
        )}
      </div>
    </>
  );
}
