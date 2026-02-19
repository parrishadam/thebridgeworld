import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { getOrCreateProfile } from "@/lib/subscription";
import { getSupabaseAdmin } from "@/lib/supabase";
import ArticleEditor from "@/components/editor/ArticleEditor";
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
  if (!profile.is_admin && !profile.is_contributor) redirect("/");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  // Non-admins can only edit their own articles
  if (!profile.is_admin && data.author_id !== userId) redirect("/editor");

  return (
    <ArticleEditor
      article={data as SupabaseArticle}
      isAdmin={profile.is_admin}
    />
  );
}
