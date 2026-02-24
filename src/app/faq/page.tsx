import { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FaqAccordion from "@/components/faq/FaqAccordion";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "FAQ — The Bridge World",
  description:
    "Frequently asked questions about The Bridge World, subscriptions, the Master Solvers' Club, and more.",
};

export default async function FaqPage() {
  const { data: faqs } = await getSupabaseAdmin()
    .from("faqs")
    .select("id, question, answer")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-gray-900 mb-2">
          Frequently Asked Questions
        </h1>
        <p className="text-lg text-gray-500 mb-10">
          Everything you need to know about <em>The Bridge World</em>
        </p>

        <FaqAccordion items={faqs ?? []} />

        <p className="mt-10 text-sm text-stone-500">
          Have a question that isn&rsquo;t answered here?{" "}
          <Link href="/contact" className="text-stone-900 underline hover:text-stone-700 transition-colors">
            Visit our Contact page
          </Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
