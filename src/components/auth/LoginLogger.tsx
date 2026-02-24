"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export default function LoginLogger() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    if (sessionStorage.getItem("login_logged")) return;

    fetch("/api/auth/log-login", { method: "POST" })
      .then(() => sessionStorage.setItem("login_logged", "1"))
      .catch(() => {/* silently ignore */});
  }, [isSignedIn]);

  return null;
}
