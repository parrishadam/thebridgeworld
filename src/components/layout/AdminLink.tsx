"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function AdminLink() {
  const { isSignedIn } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;

    async function checkAdmin() {
      try {
        const res = await fetch("/api/user/subscription");
        if (!res.ok) return;
        const data = await res.json();
        setIsAdmin(data.isAdmin === true);
      } catch {
        // API unavailable — fail silently, no admin link shown
      }
    }

    checkAdmin();
  }, [isSignedIn]);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="font-sans text-sm uppercase tracking-wider text-stone-600 hover:text-stone-900 transition-colors"
    >
      Admin
    </Link>
  );
}
