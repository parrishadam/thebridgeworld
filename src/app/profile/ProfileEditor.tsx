"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import type { UserProfile, SkillLevel } from "@/types";

const SKILL_LABELS: Record<string, string> = {
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
  expert:       "Expert",
  world_class:  "World Class",
};

const SKILL_OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: "beginner",     label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced" },
  { value: "expert",       label: "Expert" },
  { value: "world_class",  label: "World Class" },
];

interface LoginEntry {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  logged_in_at: string;
}

interface Props {
  profile: UserProfile;
  clerkName: string;
  clerkImageUrl: string | null;
  clerkInitials: string;
  isAdmin: boolean;
}

export default function ProfileEditor({ profile, clerkName, clerkImageUrl, clerkInitials, isAdmin }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(profile.display_name ?? clerkName);
  const [email, setEmail]             = useState(profile.email ?? "");
  const [bio, setBio]                 = useState(profile.bio ?? "");
  const [skillLevel, setSkillLevel]   = useState(profile.skill_level ?? "");
  const [location, setLocation]       = useState(profile.location ?? "");
  const [avatarUrl, setAvatarUrl]     = useState(profile.photo_url ?? clerkImageUrl ?? "");

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin-only state
  const [loginHistory, setLoginHistory] = useState<LoginEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-stone-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors";

  // Fetch login history for admins
  useEffect(() => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    fetch("/api/profile/login-history")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setLoginHistory(data); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [isAdmin]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      const { url } = await res.json();
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Record<string, unknown> = {
        email:       email.trim() || null,
        bio:         bio.trim() || null,
        skill_level: skillLevel || null,
        location:    location.trim() || null,
      };
      if (isAdmin) {
        payload.display_name = displayName.trim() || null;
      }
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      setSuccess(true);
      setEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!confirm("This will send a password reset email. Continue?")) return;
    setResetting(true);
    setResetMsg(null);
    setResetError(null);
    try {
      const res = await fetch("/api/profile/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.user_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      setResetMsg(data.message ?? "Password reset initiated.");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div>
      {/* Avatar + name header */}
      <div className="flex items-center gap-5 mb-10 pb-10 border-b border-stone-200">
        <div className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover bg-stone-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif text-xl font-bold">
              {clerkInitials}
            </div>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 bg-stone-900 text-white text-xs w-7 h-7 rounded-full flex items-center justify-center hover:bg-stone-700 transition-colors disabled:opacity-40"
                title="Change avatar"
              >
                {uploading ? "…" : "✎"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-3xl font-bold text-stone-900">{displayName || clerkName}</h1>
          {!editing && email && (
            <p className="font-sans text-sm text-stone-400 mt-0.5">{email}</p>
          )}
          {!editing && (
            <div className="flex items-center gap-3 mt-1">
              {skillLevel && (
                <span className="font-sans text-xs text-stone-500">
                  {SKILL_LABELS[skillLevel] ?? skillLevel}
                </span>
              )}
              {location && (
                <span className="font-sans text-xs text-stone-400">{location}</span>
              )}
            </div>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => { setEditing(true); setError(null); setSuccess(false); }}
            className="font-sans text-sm border border-stone-200 text-stone-600 px-4 py-2 hover:bg-stone-50 transition-colors shrink-0"
          >
            Edit Profile
          </button>
        )}
      </div>

      {/* Success message */}
      {success && (
        <div className="mb-6 rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Profile updated successfully.
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSave} className="space-y-6 mb-10 pb-10 border-b border-stone-200">
          <div className="border-b-2 border-stone-900 pb-2 mb-4">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
              Edit Profile
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            {isAdmin ? (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={clerkName}
                className={inputCls}
              />
            ) : (
              <p className="px-4 py-2.5 text-gray-900 bg-stone-100 rounded-lg border border-stone-200">
                {displayName || clerkName}
              </p>
            )}
            <p className="mt-1 text-xs text-stone-400">
              {isAdmin
                ? "As an admin, you can edit your display name."
                : "Your display name is managed by your account settings."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About Me</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="Tell other bridge players about yourself…"
              className={inputCls + " resize-y"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
              <select
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value)}
                className={inputCls + " bg-white"}
              >
                <option value="">Select a level…</option>
                {SKILL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className={inputCls}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-stone-900 text-white px-6 py-2.5 rounded hover:bg-stone-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              className="border border-stone-200 text-stone-600 px-6 py-2.5 rounded hover:bg-stone-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Bio display when not editing */}
      {!editing && bio && (
        <section className="mb-10 pb-10 border-b border-stone-200">
          <div className="border-b-2 border-stone-900 pb-2 mb-4">
            <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
              About
            </h2>
          </div>
          <p className="font-sans text-sm text-stone-600 leading-relaxed whitespace-pre-line">{bio}</p>
        </section>
      )}

      {/* ── Admin-only sections ─────────────────────────────────────────── */}
      {isAdmin && (
        <>
          {/* Login History */}
          <section className="mb-10 pb-10 border-b border-stone-200">
            <div className="border-b-2 border-stone-900 pb-2 mb-4">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Login History
              </h2>
            </div>
            {historyLoading ? (
              <p className="font-sans text-sm text-stone-400 italic">Loading…</p>
            ) : loginHistory.length === 0 ? (
              <p className="font-sans text-sm text-stone-400 italic">No login history recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b border-stone-200 text-left">
                      <th className="pb-2 pr-4 text-xs uppercase tracking-wider text-stone-500 font-medium">Date</th>
                      <th className="pb-2 pr-4 text-xs uppercase tracking-wider text-stone-500 font-medium">IP Address</th>
                      <th className="pb-2 text-xs uppercase tracking-wider text-stone-500 font-medium">User Agent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {loginHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2.5 pr-4 text-stone-700 whitespace-nowrap">
                          {formatDate(entry.logged_in_at)}
                        </td>
                        <td className="py-2.5 pr-4 text-stone-500 font-mono text-xs whitespace-nowrap">
                          {entry.ip_address ?? "—"}
                        </td>
                        <td
                          className="py-2.5 text-stone-400 text-xs max-w-[200px] truncate"
                          title={entry.user_agent ?? ""}
                        >
                          {entry.user_agent ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Reset Password */}
          <section className="mb-10 pb-10 border-b border-stone-200">
            <div className="border-b-2 border-stone-900 pb-2 mb-4">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Security
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="font-sans text-sm border border-red-200 text-red-600 px-4 py-2 rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? "Resetting…" : "Reset Password"}
              </button>
              {resetMsg && <p className="text-sm text-green-700">{resetMsg}</p>}
              {resetError && <p className="text-sm text-red-600">{resetError}</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
