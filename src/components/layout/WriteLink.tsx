"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function WriteLink() {
  const { isSignedIn } = useAuth();
  const [canWrite, setCanWrite] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;

    async function checkAccess() {
      try {
        const res = await fetch("/api/user/subscription");
        if (!res.ok) return;
        const data = await res.json();
        setCanWrite(data.isAdmin === true || data.isContributor === true);
      } catch {
        // API unavailable — fail silently
      }
    }

    checkAccess();
  }, [isSignedIn]);

  if (!canWrite) return null;

  return (
    <Link
      href="/editor"
      className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors"
    >
      Write
    </Link>
  );
}
