import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
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
  if (!profile.is_admin && !profile.is_author) redirect("/");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  // Non-admins can only edit their own articles
  if (!profile.is_admin && data.author_id !== userId) redirect("/my-articles");

  // Authors cannot edit published articles
  if (!profile.is_admin && data.status === "published") redirect("/my-articles");

  // Fetch current user's Clerk name
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const currentUser = {
    id:   userId,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.emailAddresses[0]?.emailAddress || "—",
  };

  // Admins get a list of all author/admin accounts to assign ownership
  let authorList: { id: string; name: string; email: string }[] | undefined;
  if (profile.is_admin) {
    const { data: authorProfiles } = await getSupabaseAdmin()
      .from("user_profiles")
      .select("user_id")
      .or("is_admin.eq.true,is_author.eq.true");

    if (authorProfiles && authorProfiles.length > 0) {
      const ids = authorProfiles.map((p: { user_id: string }) => p.user_id);
      const { data: clerkList } = await clerk.users.getUserList({ userId: ids, limit: 200 });
      authorList = (clerkList ?? []).map((u) => ({
        id:    u.id,
        name:  [u.firstName, u.lastName].filter(Boolean).join(" ") || "—",
        email: u.emailAddresses[0]?.emailAddress ?? "—",
      }));
    }
  }

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
