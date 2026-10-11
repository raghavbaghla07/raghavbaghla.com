"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { categories, type PostSummary } from "@/lib/content";
export function WorkGrid({
  posts,
  demo,
}: {
  posts: PostSummary[];
  demo: boolean;
}) {
  const [category, setCategory] = useState("All work");
  const [search, setSearch] = useState("");
  const shown = posts.filter(
    (p) =>
      (category === "All work" || p.category === category) &&
      `${p.title} ${p.excerpt}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section id="work" className="work-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE GOOD STUFF</span>
          <h2>
            A few words.
            <br />A lot of possibilities.
          </h2>
        </div>
        <p>
          Posts, ideas, and copy.
          <br />A little window into how I think.
        </p>
      </div>
      {demo && (
        <p className="demo-note">
          A preview of the canvas. These are illustrative concepts, not Raghav’s
          published work.
        </p>
      )}
      <div className="filter-bar">
        <div className="filters">
          {["All work", ...categories].map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search work"
            placeholder="Find an idea…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="work-grid">
        {shown.map((post, index) => (
          <Link className="work-card" href={`/work/${post.slug}`} key={post.id}>
            <div className={`card-art ${post.color}`}>
              {post.cover_url ? (
                <img
                  src={post.cover_url}
                  alt={post.title}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <>
                  <span className="art-label">
                    {post.category.toUpperCase()} /{" "}
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{post.title}</h3>
                  <span className="art-shape" aria-hidden="true">
                    {post.color === "peach"
                      ? "✳"
                      : post.color === "lavender"
                        ? "↗"
                        : "✺"}
                  </span>
                  <span className="art-footer">
                    A LITTLE IDEA BY RAGHAV BAGHLA
                  </span>
                </>
              )}
              <span className="card-arrow">
                <ArrowUpRight size={22} />
              </span>
            </div>
            <div className="card-meta">
              <span>{post.category}</span>
              <span>
                {demo
                  ? "Concept preview"
                  : new Date(post.created_at).toLocaleDateString("en-IN", {
                      month: "short",
                      year: "numeric",
                    })}
              </span>
            </div>
            <h3 className="card-title">{post.title.replaceAll("\n", " ")}</h3>
            <p>{post.excerpt}</p>
          </Link>
        ))}
      </div>
      {shown.length === 0 && (
        <div className="empty-state">
          {posts.length
            ? "No ideas match that search. Try another word."
            : "The first idea is on its way. Check back soon."}
        </div>
      )}
    </section>
  );
}
