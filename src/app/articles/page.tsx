import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Articles",
};

export default function ArticlesPage() {
  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="border-b-2 border-stone-900 pb-2 mb-8">
          <h1 className="font-serif text-3xl font-bold text-stone-900">Articles</h1>
        </div>
        <p className="font-sans text-stone-500">Article listing coming soon.</p>
      </main>
      <Footer />
    </>
  );
}
