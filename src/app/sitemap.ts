import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/posts";
import { configured } from "@/lib/content";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = configured ? await getPosts() : [];
  return [
    { url: "https://raghavbaghla.com", changeFrequency: "weekly", priority: 1 },
    ...posts.map((p) => ({
      url: `https://raghavbaghla.com/work/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
