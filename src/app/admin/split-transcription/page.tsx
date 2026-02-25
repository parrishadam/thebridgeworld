import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SplitClient from "./SplitClient";

export const metadata: Metadata = { title: "Split Transcription — Admin" };

export default async function SplitTranscriptionPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { getOrCreateProfile } = await import("@/lib/subscription");
  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin) redirect("/");

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="border-b-2 border-stone-900 pb-2 mb-2">
          <h1 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
            Admin
          </h1>
        </div>
        <div className="mb-8">
          <p className="font-serif text-2xl font-bold text-stone-900">
            Split Transcription
          </p>
          <p className="font-sans text-sm text-stone-400 mt-1">
            Load a full-transcription JSON, assign blocks to articles, and import.
          </p>
        </div>
        <SplitClient />
      </main>
      <Footer />
    </>
  );
}
