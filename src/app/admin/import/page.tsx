import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ImportClient from "./ImportClient";

export const metadata: Metadata = { title: "Import Issue — Admin" };

export default async function ImportPage() {
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
            Import Issue from PDF
          </p>
          <p className="font-sans text-sm text-stone-400 mt-1">
            Upload a Bridge World magazine PDF to parse it into structured articles.
          </p>
        </div>
        <ImportClient />
      </main>
      <Footer />
    </>
  );
}
