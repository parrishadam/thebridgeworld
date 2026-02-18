import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await currentUser();

  // Middleware already protects this route, but guard defensively
  if (!user) redirect("/sign-in");

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.emailAddresses[0]?.emailAddress ||
    "Member";

  const initials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">

        {/* Profile header */}
        <div className="flex items-center gap-5 mb-10 pb-10 border-b border-stone-200">
          {user.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.imageUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover bg-stone-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif text-xl font-bold">
              {initials}
            </div>
          )}
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-900">{displayName}</h1>
            <p className="font-sans text-sm text-stone-400 mt-0.5">
              {user.emailAddresses[0]?.emailAddress}
            </p>
            <p className="font-sans text-xs uppercase tracking-wide text-stone-400 mt-1">
              Member since {new Date(user.createdAt!).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-8">

          {/* Subscription */}
          <section>
            <div className="border-b-2 border-stone-900 pb-2 mb-4">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Subscription
              </h2>
            </div>
            <div className="bg-white border border-stone-200 rounded-sm p-5 flex items-center justify-between">
              <div>
                <p className="font-serif text-base font-semibold text-stone-900">Free Plan</p>
                <p className="font-sans text-sm text-stone-400 mt-0.5">
                  Access to selected free articles.
                </p>
              </div>
              <button className="font-sans text-xs uppercase tracking-wider bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors">
                Upgrade
              </button>
            </div>
          </section>

          {/* Reading history placeholder */}
          <section>
            <div className="border-b-2 border-stone-900 pb-2 mb-4">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Recently Read
              </h2>
            </div>
            <p className="font-sans text-sm text-stone-400 italic">
              Your reading history will appear here.
            </p>
          </section>

          {/* Account actions */}
          <section>
            <div className="border-b-2 border-stone-900 pb-2 mb-4">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Account
              </h2>
            </div>
            <div className="space-y-2">
              <a
                href="/sign-in"
                className="block font-sans text-sm text-stone-600 hover:text-stone-900 transition-colors"
              >
                Manage account settings →
              </a>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
