import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import { getPost } from "@/lib/posts";
import { Header, Footer } from "@/components/header";
import { RichContent } from "@/components/rich-content";
import { Engagement } from "@/components/engagement";
import { configured, safeUrl } from "@/lib/content";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Work not found" };
  const title = post.title.replaceAll("\n", " ");
  return {
    title,
    description: post.excerpt,
    alternates: { canonical: `/work/${post.slug}` },
    openGraph: {
      title,
      description: post.excerpt,
      url: `/work/${post.slug}`,
      type: "article",
      ...(safeUrl(post.cover_url) ? { images: [post.cover_url!] } : {}),
    },
  };
}
export default async function WorkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return (
    <>
      <Header />
      <main className="article">
        <Link className="back-link" href="/#work">
          <ArrowLeft size={16} /> Back to the ideas
        </Link>
        <div className="article-meta">
          <span>{post.category}</span>
          <span>
            {configured
              ? new Date(post.created_at).toLocaleDateString("en-IN", {
                  dateStyle: "long",
                })
              : "Illustrative concept"}
          </span>
        </div>
        <h1>{post.title}</h1>
        <p className="article-excerpt">{post.excerpt}</p>
        {post.cover_url && (
          <img
            className="article-cover"
            src={post.cover_url}
            alt={post.title}
            fetchPriority="high"
          />
        )}
        <div className="prose">
          <RichContent node={post.content} />
        </div>
        {post.attachments?.length > 0 && (
          <section className="attachments">
            <h2>Take a closer look</h2>
            {post.attachments.map(
              (file) =>
                safeUrl(file.url) && (
                  <a
                    key={file.url}
                    href={safeUrl(file.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={18} />
                    {file.name}
                    <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </a>
                ),
            )}
          </section>
        )}
        <Engagement post={post} demo={!configured} />
      </main>
      <Footer />
    </>
  );
}
