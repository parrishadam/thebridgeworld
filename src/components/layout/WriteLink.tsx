"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function WriteLink() {
  const { isSignedIn } = useAuth();
  const [canWrite, setCanWrite] = useState(false);
  const [isAdmin,  setIsAdmin]  = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;

    async function checkAccess() {
      try {
        const res = await fetch("/api/user/subscription");
        if (!res.ok) return;
        const data = await res.json();
        setIsAdmin(data.isAdmin === true);
        setCanWrite(data.isAdmin === true || data.isAuthor === true);
      } catch {
        // API unavailable — fail silently
      }
    }

    checkAccess();
  }, [isSignedIn]);

  if (!canWrite) return null;

  if (isAdmin) {
    return (
      <Link
        href="/admin/articles"
        className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors"
      >
        Article Administration
      </Link>
    );
  }

  return (
    <Link
      href="/my-articles"
      className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors"
    >
      My Articles
    </Link>
  );
}
