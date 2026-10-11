"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Link as LinkIcon,
  ArrowUpRight,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { Post } from "@/lib/content";
type Comment = { id: string; name: string; body: string; created_at: string };
export function Engagement({ post, demo }: { post: Post; demo: boolean }) {
  const [stats, setStats] = useState({ likes: 0, comments: 0, liked: false });
  const [comments, setComments] = useState<Comment[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [url, setUrl] = useState("");
  const commentsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setUrl(window.location.origin + `/work/${post.slug}`);
    if (demo) return;
    let active = true;
    void fetch(`/api/engagement/${post.id}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        if (!response.ok) setMessage(data.error);
        else setStats(data);
      })
      .catch(() => {
        if (active) setMessage("Couldn’t load reactions. Please try again.");
      });
    void getSupabase()!
      .from("comments")
      .select("id,name,body,created_at")
      .eq("post_id", post.id)
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (active) {
          if (error) setMessage("Couldn’t load comments.");
          else setComments(data ?? []);
        }
      });
    return () => {
      active = false;
    };
  }, [post.id, post.slug, demo]);
  async function submit(body: {
    action: string;
    name?: string;
    body?: string;
  }) {
    const response = await fetch(`/api/engagement/${post.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Couldn’t save. Please try again.");
    if (data.stats) setStats(data.stats);
  }
  async function like() {
    if (demo) {
      setMessage(
        "Likes will be available when the live database is connected.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await submit({ action: "like" });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    try {
      await submit({
        action: "comment",
        name: String(fields.get("name")).trim(),
        body: String(fields.get("body")).trim(),
      });
      form.reset();
      setMessage("Thank you! Your comment is awaiting approval.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Post link copied.");
    } catch {
      setMessage(`Copy this link: ${url}`);
    }
  }
  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text: post.excerpt, url });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setShareOpen(true);
      }
    } else setMessage("Choose a social network above, or copy the link.");
  }
  return (
    <section className="engagement">
      <div className="reaction-bar">
        <button onClick={like} disabled={busy} aria-pressed={stats.liked}>
          <Heart size={19} fill={stats.liked ? "currentColor" : "none"} />{" "}
          {stats.likes} <span>Likes</span>
        </button>
        <button
          onClick={() =>
            commentsRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <MessageCircle size={19} /> {stats.comments} <span>Comments</span>
        </button>
        <button
          className="share-button"
          onClick={() => setShareOpen(!shareOpen)}
          aria-expanded={shareOpen}
        >
          <Share2 size={18} /> Share this idea
        </button>
      </div>
      {shareOpen && (
        <div className="share-options">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${post.title}\n${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp <ArrowUpRight size={14} />
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn <ArrowUpRight size={14} />
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook <ArrowUpRight size={14} />
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            X <ArrowUpRight size={14} />
          </a>
          <button onClick={copy}>
            <LinkIcon size={14} /> Copy link
          </button>
          <button onClick={nativeShare}>
            <Share2 size={14} /> More apps
          </button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="comments" ref={commentsRef}>
        <span className="eyebrow">LET’S TALK ABOUT IT</span>
        <h2>Leave a little thought.</h2>
        {demo ? (
          <p className="muted">
            Comments and likes will open once the live database is connected.
          </p>
        ) : (
          <form onSubmit={comment}>
            <div className="field-row">
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
              <span className="muted">
                No account needed. Comments are reviewed before appearing here.
              </span>
            </div>
            <label>
              Your thought
              <textarea
                name="body"
                required
                minLength={3}
                maxLength={2000}
                rows={4}
                placeholder="What did this idea make you think of?"
              />
            </label>
            <button className="button dark" disabled={busy}>
              Send comment <ArrowUpRight size={16} />
            </button>
          </form>
        )}
        {comments.map((c) => (
          <article className="comment" key={c.id}>
            <div>
              <strong>{c.name}</strong>
              <time>{new Date(c.created_at).toLocaleDateString("en-IN")}</time>
            </div>
            <p>{c.body}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
