import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateProfile } from "@/lib/subscription";
import ArticleEditor from "@/components/editor/ArticleEditor";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_contributor) redirect("/");

  return (
    <ArticleEditor isAdmin={profile.is_admin} />
  );
}
