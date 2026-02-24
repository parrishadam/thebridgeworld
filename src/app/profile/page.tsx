import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProfileEditor from "./ProfileEditor";
import { getOrCreateProfile } from "@/lib/subscription";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const profile = await getOrCreateProfile(user.id);

  const clerkName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.emailAddresses[0]?.emailAddress ||
    "Member";

  const clerkInitials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  const tierLabels: Record<string, string> = {
    free: "Free Plan",
    paid: "Paid Plan",
    premium: "Premium Plan",
  };

  const tierDescriptions: Record<string, string> = {
    free: "Access to selected free articles.",
    paid: "Full access to the current archive.",
    premium: "Everything, including interactive hands and special features.",
  };

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">

        <ProfileEditor
          profile={profile}
          clerkName={clerkName}
          clerkImageUrl={user.imageUrl ?? null}
          clerkInitials={clerkInitials}
          isAdmin={profile.is_admin}
        />

        {/* Sections */}
        <div className="space-y-8">

          {/* Public profile link */}
          <section>
            <Link
              href={`/profile/${user.id}`}
              className="inline-block font-sans text-sm text-stone-600 hover:text-stone-900 transition-colors"
            >
              View public profile →
            </Link>
          </section>

          {/* Subscription */}
          <section>
            <div className="border-b-2 border-stone-900 pb-2 mb-4">
              <h2 className="font-sans text-xs uppercase tracking-[0.25em] text-stone-500">
                Subscription
              </h2>
            </div>
            <div className="bg-white border border-stone-200 rounded-sm p-5 flex items-center justify-between">
              <div>
                <p className="font-serif text-base font-semibold text-stone-900">
                  {tierLabels[profile.tier] ?? "Free Plan"}
                </p>
                <p className="font-sans text-sm text-stone-400 mt-0.5">
                  {tierDescriptions[profile.tier] ?? tierDescriptions.free}
                </p>
              </div>
              {profile.tier === "free" && (
                <button className="font-sans text-xs uppercase tracking-wider bg-stone-900 text-white px-4 py-2 hover:bg-stone-700 transition-colors">
                  Upgrade
                </button>
              )}
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
