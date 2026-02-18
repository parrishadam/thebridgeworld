import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Create Account" };

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4 py-16">
      {/* Masthead */}
      <Link href="/" className="group mb-10 text-center block">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-stone-400 mb-1">The</p>
        <p className="font-serif text-3xl font-bold text-stone-900 group-hover:text-brand-700 transition-colors">
          Bridge World
        </p>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-stone-400 mt-1">
          Digital Magazine
        </p>
      </Link>

      <SignUp
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "shadow-none border border-stone-200 rounded-sm bg-white",
            headerTitle: "font-serif text-xl text-stone-900",
            headerSubtitle: "font-sans text-stone-500",
            formButtonPrimary:
              "bg-stone-900 hover:bg-stone-700 text-white font-sans text-sm tracking-wide rounded-sm",
            formFieldInput:
              "border-stone-200 rounded-sm font-sans text-sm focus:ring-stone-400",
            footerActionLink: "text-brand-700 hover:text-brand-900 font-sans",
            dividerLine: "bg-stone-200",
            dividerText: "text-stone-400 font-sans text-xs",
            socialButtonsBlockButton:
              "border-stone-200 rounded-sm font-sans text-sm text-stone-700 hover:bg-stone-50",
          },
        }}
      />
    </div>
  );
}
