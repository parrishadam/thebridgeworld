"use client";

import { useState } from "react";
import Link from "next/link";
import type { SubscriptionTier, SupabaseArticle } from "@/types";
import { formatArticleDate, issueMonthYear } from "@/lib/utils";

interface UserData {
  user_id:        string;
  name:           string;
  email:          string;
  photo_url:      string;
  tier:           SubscriptionTier;
  is_admin:       boolean;
  is_author:      boolean;
  is_contributor: boolean;
  is_legacy:      boolean;
  bio:            string | null;
  first_name:     string | null;
  last_name:      string | null;
  created_at:     string;
}

type ArticleSummary = Pick<
  SupabaseArticle,
  "id" | "title" | "slug" | "category" | "status" | "published_at" | "month" | "year"
>;

interface MergeTarget {
  user_id: string;
  name:    string;
  email:   string;
}

const TIERS: SubscriptionTier[] = ["free", "paid", "premium"];

const tierBadge: Record<SubscriptionTier, string> = {
  free:    "bg-stone-100 text-stone-600",
  paid:    "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
};

const statusBadge: Record<string, string> = {
  draft:     "bg-stone-100 text-stone-500",
  published: "bg-green-100 text-green-700",
  archived:  "bg-amber-100 text-amber-700",
};

export default function UserDetailPanel({
  user: initialUser,
  articles,
  mergeTargets,
  currentUserId,
}: {
  user: UserData;
  articles: ArticleSummary[];
  mergeTargets: MergeTarget[];
  currentUserId: string;
}) {
  const [user, setUser] = useState<UserData>(initialUser);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  // ── Merge state ───────────────────────────────────────────────────────
  const [showMerge, setShowMerge]       = useState(false);
  const [mergeTarget, setMergeTarget]   = useState("");
  const [mergeSaving, setMergeSaving]   = useState(false);
  const [mergeError, setMergeError]     = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);

  async function patchProfile(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${user.user_id}/profile`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      throw new Error(msg ?? "Update failed");
    }
    return res.json();
  }

  async function handleTierChange(newTier: SubscriptionTier) {
    setSaving("tier");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.user_id}/tier`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tier: newTier }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }
      setUser(u => ({ ...u, tier: newTier }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(null);
    }
  }

  async function handleToggle(field: "is_admin" | "is_author" | "is_contributor" | "is_legacy", newValue: boolean) {
    setSaving(field);
    setError(null);
    const bodyKeyMap: Record<string, string> = {
      is_admin: "isAdmin",
      is_author: "isAuthor",
      is_contributor: "isContributor",
      is_legacy: "isLegacy",
    };
    try {
      await patchProfile({ [bodyKeyMap[field]]: newValue });
      setUser(u => ({ ...u, [field]: newValue }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(null);
    }
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    setMergeSaving(true);
    setMergeError(null);
    try {
      const res = await fetch("/api/admin/users/merge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ legacyUserId: user.user_id, targetUserId: mergeTarget }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Merge failed");
      }
      setMergeSuccess(true);
      setShowMerge(false);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMergeSaving(false);
    }
  }

  const isSelf = currentUserId === user.user_id;

  return (
    <div className="space-y-8">
      {/* ── User info header ── */}
      <div className="bg-white border border-stone-200 rounded-sm p-6">
        <div className="flex items-start gap-5">
          {user.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photo_url}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover bg-stone-200 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-stone-200 flex items-center justify-center text-2xl font-semibold text-stone-500 shrink-0">
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-2xl font-bold text-stone-900">{user.name}</h1>
              {user.is_legacy && (
                <span className="text-xs font-sans font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-stone-100 text-stone-500">
                  Legacy
                </span>
              )}
            </div>
            <p className="font-sans text-sm text-stone-500 mt-1">{user.email}</p>
            <p className="font-sans text-xs text-stone-400 mt-1">
              ID: <code className="bg-stone-50 px-1 py-0.5 rounded">{user.user_id}</code>
            </p>
            <p className="font-sans text-xs text-stone-400 mt-1">
              Member since {new Date(user.created_at).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric",
              })}
            </p>
            {user.bio && (
              <p className="font-sans text-sm text-stone-600 mt-3 italic">{user.bio}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-sans px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      {/* ── Subscription tier ── */}
      <div className="bg-white border border-stone-200 rounded-sm p-6">
        <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Subscription Tier
        </h2>
        <div className="flex items-center gap-3">
          <span className={`inline-block text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${tierBadge[user.tier]}`}>
            {user.tier}
          </span>
          {!user.is_legacy && (
            <select
              value={user.tier}
              disabled={saving === "tier"}
              onChange={(e) => handleTierChange(e.target.value as SubscriptionTier)}
              className="text-sm border border-stone-200 rounded px-3 py-1.5 text-stone-600 bg-white hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-50"
            >
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {saving === "tier" && (
            <span className="text-xs text-stone-400">Saving...</span>
          )}
        </div>
      </div>

      {/* ── Roles ── */}
      <div className="bg-white border border-stone-200 rounded-sm p-6">
        <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Roles
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Admin */}
          <label className={`flex items-center gap-2 ${isSelf || user.is_legacy ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={user.is_admin}
              disabled={saving === "is_admin" || isSelf || user.is_legacy}
              onChange={(e) => handleToggle("is_admin", e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-sans text-stone-700">
              {saving === "is_admin" ? "Saving..." : "Admin"}
            </span>
          </label>

          {/* Author */}
          <label className={`flex items-center gap-2 ${user.is_admin ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={user.is_author || user.is_admin}
              disabled={saving === "is_author" || user.is_admin}
              onChange={(e) => handleToggle("is_author", e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-sans text-stone-700">
              {saving === "is_author" ? "Saving..." : "Author"}
            </span>
          </label>

          {/* Contributor */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={user.is_contributor}
              disabled={saving === "is_contributor"}
              onChange={(e) => handleToggle("is_contributor", e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-sans text-stone-700">
              {saving === "is_contributor" ? "Saving..." : "Contributor"}
            </span>
          </label>

          {/* Legacy */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={user.is_legacy}
              disabled={saving === "is_legacy"}
              onChange={(e) => handleToggle("is_legacy", e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-sans text-stone-700">
              {saving === "is_legacy" ? "Saving..." : "Legacy"}
            </span>
          </label>
        </div>
      </div>

      {/* ── Legacy merge ── */}
      {user.is_legacy && !mergeSuccess && (
        <div className="bg-white border border-stone-200 rounded-sm p-6">
          <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
            Assign to User
          </h2>
          <p className="font-sans text-sm text-stone-500 mb-4">
            Transfer all articles from this legacy profile to a real user account, then delete this profile.
          </p>
          {!showMerge ? (
            <button
              onClick={() => setShowMerge(true)}
              className="font-sans text-sm border border-blue-200 text-blue-600 px-4 py-2 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              Assign to User
            </button>
          ) : (
            <div className="space-y-3 max-w-md">
              <select
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                <option value="">-- Select target user --</option>
                {mergeTargets.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.name} ({t.email})
                  </option>
                ))}
              </select>
              {mergeError && (
                <p className="text-xs text-red-600">{mergeError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleMerge}
                  disabled={mergeSaving || !mergeTarget}
                  className="font-sans text-sm bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {mergeSaving ? "Merging..." : "Merge"}
                </button>
                <button
                  onClick={() => { setShowMerge(false); setMergeTarget(""); setMergeError(null); }}
                  disabled={mergeSaving}
                  className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mergeSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-4 py-3">
          <p className="font-sans text-sm text-green-800 font-semibold">
            Profile merged successfully. This user has been removed.
          </p>
          <Link
            href="/admin"
            className="font-sans text-sm text-green-700 hover:text-green-900 underline mt-2 inline-block"
          >
            Back to Admin
          </Link>
        </div>
      )}

      {/* ── Articles ── */}
      <div className="bg-white border border-stone-200 rounded-sm p-6">
        <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Articles ({articles.length})
        </h2>
        {articles.length === 0 ? (
          <p className="font-sans text-sm text-stone-400 italic">No articles found.</p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.id}
                className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${statusBadge[article.status] || statusBadge.draft}`}>
                      {article.status}
                    </span>
                    {article.category && (
                      <span className="text-xs text-stone-400">{article.category}</span>
                    )}
                  </div>
                  <Link
                    href={article.status === "published" ? `/articles/${article.slug}` : `/editor/${article.id}`}
                    className="font-serif text-sm font-medium text-stone-900 hover:text-stone-600 transition-colors"
                  >
                    {article.title}
                  </Link>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {formatArticleDate(article.published_at ?? "", issueMonthYear(article.month, article.year))}
                  </p>
                </div>
                <Link
                  href={`/editor/${article.id}`}
                  className="font-sans text-xs border border-stone-200 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-50 hover:border-stone-300 transition-colors shrink-0 ml-4"
                >
                  Edit
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
