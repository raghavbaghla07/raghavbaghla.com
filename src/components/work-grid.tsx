"use client";
import { useState } from "react";
import Link from "next/link";
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
          <h2>Selected writing</h2>
        </div>

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
          <input
            aria-label="Search work"
            placeholder="Find an idea…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="work-grid">
        {shown.map((post) => (
          <Link className="work-card" href={`/work/${post.slug}`} key={post.id}>
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
