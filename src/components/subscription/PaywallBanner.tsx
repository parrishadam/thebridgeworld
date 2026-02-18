"use client";

import Link from "next/link";

interface PaywallBannerProps {
  variant: "unauthenticated" | "limit_reached";
}

export default function PaywallBanner({ variant }: PaywallBannerProps) {
  return (
    <div className="my-10 border border-stone-200 bg-white rounded-sm overflow-hidden">
      {/* Decorative top bar */}
      <div className="h-1 bg-gradient-to-r from-stone-300 via-brand-400 to-stone-300" />

      <div className="px-8 py-10 text-center max-w-lg mx-auto">
        {variant === "unauthenticated" ? (
          <>
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-stone-400 mb-3">
              Members only
            </p>
            <h2 className="font-serif text-2xl font-bold text-stone-900 mb-3">
              Sign in to keep reading
            </h2>
            <p className="font-sans text-sm text-stone-500 leading-relaxed mb-8">
              Create a free account to read up to{" "}
              <strong className="text-stone-700">3 articles per month</strong>.
              Upgrade anytime for unlimited access.
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
        ) : (
          <>
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-stone-400 mb-3">
              Monthly limit reached
            </p>
            <h2 className="font-serif text-2xl font-bold text-stone-900 mb-3">
              You&apos;ve read your 3 free articles this month
            </h2>
            <p className="font-sans text-sm text-stone-500 leading-relaxed mb-8">
              Upgrade to a paid subscription for{" "}
              <strong className="text-stone-700">unlimited article access</strong>,
              or wait until next month for your free allowance to reset.
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
      </div>
    </div>
  );
}
