import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getOrCreateProfile } from "@/lib/subscription";
import { buildAuthorList } from "@/lib/authorList";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) redirect("/");

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const currentUser = {
    id:   userId,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.emailAddresses[0]?.emailAddress || "—",
  };

  const authorList = profile.is_admin ? await buildAuthorList(clerk) : undefined;

  return (
    <ArticleEditor
      isAdmin={profile.is_admin}
      isAuthor={profile.is_author || profile.is_admin}
      currentUser={currentUser}
      authorList={authorList}
    />
  );
}
