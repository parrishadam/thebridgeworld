"use client";

import Link from "next/link";

interface PaywallBannerProps {
  variant: "sign_in" | "upgrade_paid" | "upgrade_premium";
}

export default function PaywallBanner({ variant }: PaywallBannerProps) {
  return (
    <div className="my-10 border border-stone-200 bg-white rounded-sm overflow-hidden">
      {/* Decorative top bar */}
      <div className="h-1 bg-gradient-to-r from-stone-300 via-brand-400 to-stone-300" />

      <div className="px-8 py-10 text-center max-w-lg mx-auto">
        {variant === "sign_in" && (
          <>
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-stone-400 mb-3">
              Members only
            </p>
            <h2 className="font-serif text-2xl font-bold text-stone-900 mb-3">
              Sign in to keep reading
            </h2>
            <p className="font-sans text-sm text-stone-500 leading-relaxed mb-8">
              Create a free account to access free articles, or upgrade for{" "}
              <strong className="text-stone-700">unlimited paid and premium content</strong>.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/sign-in"
                className="font-sans text-sm uppercase tracking-wider text-stone-700 border border-stone-300 px-5 py-2.5 hover:bg-stone-50 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="font-sans text-sm uppercase tracking-wider bg-stone-900 text-white px-5 py-2.5 hover:bg-stone-700 transition-colors"
              >
                Create Free Account
              </Link>
            </div>
          </>
        )}

        {variant === "upgrade_paid" && (
          <>
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-stone-400 mb-3">
              Paid subscribers only
            </p>
            <h2 className="font-serif text-2xl font-bold text-stone-900 mb-3">
              Upgrade to read this article
            </h2>
            <p className="font-sans text-sm text-stone-500 leading-relaxed mb-8">
              This article is available to{" "}
              <strong className="text-stone-700">paid and premium subscribers</strong>.
              Upgrade your plan to unlock full access to all paid content.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/profile"
                className="font-sans text-sm uppercase tracking-wider bg-stone-900 text-white px-5 py-2.5 hover:bg-stone-700 transition-colors"
              >
                Upgrade Your Plan
              </Link>
              <Link
                href="/"
                className="font-sans text-sm uppercase tracking-wider text-stone-600 border border-stone-200 px-5 py-2.5 hover:bg-stone-50 transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </>
        )}

        {variant === "upgrade_premium" && (
          <>
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-stone-400 mb-3">
              Premium subscribers only
            </p>
            <h2 className="font-serif text-2xl font-bold text-stone-900 mb-3">
              Premium access required
            </h2>
            <p className="font-sans text-sm text-stone-500 leading-relaxed mb-8">
              This article is exclusive to{" "}
              <strong className="text-stone-700">premium subscribers</strong>.
              Upgrade to our premium plan for the full experience.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/profile"
                className="font-sans text-sm uppercase tracking-wider bg-stone-900 text-white px-5 py-2.5 hover:bg-stone-700 transition-colors"
              >
                Go Premium
              </Link>
              <Link
                href="/"
                className="font-sans text-sm uppercase tracking-wider text-stone-600 border border-stone-200 px-5 py-2.5 hover:bg-stone-50 transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
