import { createClient } from "@supabase/supabase-js";
import { configured, samples, type Post, type PostSummary } from "./content";
export async function getPosts(): Promise<PostSummary[]> {
  if (!configured) return samples;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db
    .from("posts")
    .select("id,slug,title,excerpt,category,color,cover_url,created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (error)
    throw new Error(
      "The portfolio could not be loaded. Please try again shortly.",
    );
  return data as PostSummary[];
}
export async function getPost(slug: string): Promise<Post | undefined> {
  if (!configured) return samples.find((p) => p.slug === slug);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("published", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error)
    throw new Error("This post could not be loaded. Please try again shortly.");
  return data as Post | undefined;
}
