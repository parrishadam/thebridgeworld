"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export default function HeaderAuth() {
  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="redirect">
          <button className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors">
            Sign In
          </button>
        </SignInButton>
        <Link
          href="/sign-up"
          className="font-sans text-xs uppercase tracking-wider bg-stone-900 text-white px-3 py-1.5 hover:bg-stone-700 transition-colors"
        >
          Subscribe
        </Link>
      </SignedOut>

      <SignedIn>
        <Link
          href="/profile"
          className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors"
        >
          Profile
        </Link>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard: "shadow-md border border-stone-200 rounded-sm font-sans",
              userButtonPopoverActionButton: "font-sans text-sm text-stone-700 hover:bg-stone-50",
              userButtonPopoverActionButtonText: "font-sans text-sm",
              userButtonPopoverFooter: "hidden",
            },
          }}
        />
      </SignedIn>
    </div>
  );
}
