import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import ArticleEditor from "@/components/editor/ArticleEditor";
import { buildAuthorList } from "@/lib/authorList";
import type { SupabaseArticle } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditorEditPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getOrCreateProfile(userId);
  if (!profile.is_admin && !profile.is_author) redirect("/");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  if (!profile.is_admin && data.author_id !== userId) redirect("/my-articles");
  if (!profile.is_admin && data.status === "published") redirect("/my-articles");

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const currentUser = {
    id:   userId,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.emailAddresses[0]?.emailAddress || "—",
  };

  const authorList = profile.is_admin ? await buildAuthorList(clerk) : undefined;

  return (
    <ArticleEditor
      article={data as SupabaseArticle}
      isAdmin={profile.is_admin}
      isAuthor={profile.is_author || profile.is_admin}
      currentUser={currentUser}
      authorList={authorList}
    />
  );
}
