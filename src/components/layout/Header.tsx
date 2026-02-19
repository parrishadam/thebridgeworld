import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import HeaderAuth from "./HeaderAuth";

const navLinks = [
  { href: "/articles", label: "Articles" },
  { href: "/issues", label: "Issues" },
  { href: "/articles?category=bidding", label: "Bidding" },
  { href: "/articles?category=play", label: "Play" },
  { href: "/articles?category=tournaments", label: "Tournaments" },
];

export default async function Header() {
  const { userId } = await auth();
  let isAdmin = false;
  if (userId) {
    const status = await getSubscriptionStatus(userId);
    isAdmin = status.isAdmin;
  }

  return (
    <header className="border-b border-stone-200 bg-white">
      {/* Masthead */}
      <div className="border-b border-stone-100 py-4 px-4">
        <div className="max-w-7xl mx-auto flex items-center">
          {/* Left spacer — mirrors the auth block for centering */}
          <div className="flex-1" />

          {/* Centred masthead */}
          <Link href="/" className="group text-center">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-stone-500 mb-0.5">
              The
            </p>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-stone-900 group-hover:text-brand-700 transition-colors leading-none">
              Bridge World
            </h1>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-stone-500 mt-0.5">
              Digital Magazine
            </p>
          </Link>

          {/* Auth controls — right-aligned */}
          <div className="flex-1 flex justify-end">
            <HeaderAuth isAdmin={isAdmin} />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex items-center justify-center gap-8 py-3 px-4">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
