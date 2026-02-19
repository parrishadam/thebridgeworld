"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function AdminLink() {
  const { isSignedIn } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/user/subscription")
      .then((r) => r.json())
      .then((data) => setIsAdmin(data.isAdmin === true))
      .catch(() => {});
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
