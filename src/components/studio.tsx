"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Save,
  Send,
  Paperclip,
  X,
  LogOut,
  Check,
  Trash2,
  Eye,
  PenLine,
  Asterisk,
} from "lucide-react";
import { Editor } from "./editor";
import { RichContent } from "./rich-content";
import { getSupabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/upload";
import { categories, colors, configured, type Post } from "@/lib/content";
type PendingComment = {
  id: string;
  name: string;
  body: string;
  post_id: string;
  created_at: string;
};
function fresh(): Post {
  return {
    id: crypto.randomUUID(),
    slug: "",
    title: "",
    excerpt: "",
    category: categories[0],
    color: colors[0],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    cover_url: null,
    attachments: [],
    published: false,
    created_at: new Date().toISOString(),
  };
}
export function Studio() {
  const demo = !configured;
  const [access, setAccess] = useState<
    "loading" | "login" | "denied" | "admin"
  >(demo ? "admin" : "loading");
  const [posts, setPosts] = useState<Post[]>([]);
  const [current, setCurrent] = useState<Post | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingComment[]>([]);
  const [tab, setTab] = useState("posts");
  async function load() {
    const db = getSupabase();
    if (!db) return;
    const [work, comments] = await Promise.all([
      db.from("posts").select("*").order("created_at", { ascending: false }),
      db
        .from("comments")
        .select("id,name,body,post_id,created_at")
        .eq("approved", false)
        .order("created_at", { ascending: false }),
    ]);
    if (work.error || comments.error) {
      setMessage(
        "Couldn’t load the studio. Check that the database setup has been applied.",
      );
      return;
    }
    setPosts(work.data as Post[]);
    setPending(comments.data ?? []);
  }
  useEffect(() => {
    if (demo) {
      try {
        setPosts(
          JSON.parse(localStorage.getItem("raghav-studio-drafts") ?? "[]"),
        );
      } catch {
        setMessage("Couldn’t restore local drafts.");
      }
      setCurrent(fresh());
      return;
    }
    const db = getSupabase()!;
    async function check() {
      const {
        data: { session },
      } = await db.auth.getSession();
      if (!session) {
        setAccess("login");
        return;
      }
      const { data, error } = await db.rpc("is_admin");
      if (error || !data) {
        setAccess("denied");
        return;
      }
      setAccess("admin");
      setCurrent((previous) => previous ?? fresh());
      await load();
    }
    void check();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(() => void check(), 0);
    });
    return () => subscription.unsubscribe();
    // Initialization is driven by configuration and auth events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(value: Partial<Post>) {
    setCurrent((p) => (p ? { ...p, ...value } : p));
    setDirty(true);
  }
  function choose(post: Post) {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and open another post?")
    )
      return;
    setCurrent(post);
    setEditorKey((k) => k + 1);
    setDirty(false);
    setPreview(false);
    setMessage("");
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabase()!.auth.signInWithPassword({
        email: String(fields.get("email")),
        password: String(fields.get("password")),
      });
      if (error) throw error;
    } catch {
      setMessage("Couldn’t sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }
  async function save(publish: boolean) {
    if (!current) return;
    if (!current.title.trim() || !current.excerpt.trim()) {
      setMessage("Add a title and a short introduction before saving.");
      return;
    }
    const slug = (current.slug || current.title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) {
      setMessage("Please add a URL slug using letters or numbers.");
      return;
    }
    const post = {
      ...current,
      title: current.title.trim(),
      slug,
      published: demo ? false : publish,
    };
    setBusy(true);
    try {
      if (demo) {
        const next = [post, ...posts.filter((p) => p.id !== post.id)];
        localStorage.setItem("raghav-studio-drafts", JSON.stringify(next));
        setPosts(next);
      } else {
        const { error } = await getSupabase()!.from("posts").upsert(post);
        if (error) throw error;
        await load();
      }
      setCurrent(post);
      setDirty(false);
      setMessage(
        demo
          ? "Draft saved in this browser only. Connect the backend to publish it online."
          : publish
            ? "Published! Your post is now on the portfolio."
            : "Draft saved. It’s private until you publish it.",
      );
    } catch {
      setMessage(
        "Couldn’t save. Check your connection, permissions, and whether the URL slug is already used.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(post: Post) {
    if (
      !window.confirm(
        `Delete “${post.title}”? This also deletes its likes and comments. Uploaded media remains in R2.`,
      )
    )
      return;
    setBusy(true);
    try {
      if (demo) {
        const next = posts.filter((p) => p.id !== post.id);
        localStorage.setItem("raghav-studio-drafts", JSON.stringify(next));
        setPosts(next);
      } else {
        const { error } = await getSupabase()!
          .from("posts")
          .delete()
          .eq("id", post.id);
        if (error) throw error;
        await load();
      }
      if (current?.id === post.id) {
        setCurrent(fresh());
        setEditorKey((k) => k + 1);
        setDirty(false);
      }
      setMessage("Post deleted.");
    } catch {
      setMessage("Couldn’t delete the post.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined, cover: boolean) {
    if (!file || !current) return;
    setBusy(true);
    setMessage("Preparing and uploading your file…");
    try {
      const result = await uploadFile(file, demo);
      if (cover) update({ cover_url: result.url });
      else update({ attachments: [...current.attachments, result] });
      setMessage("Uploaded. Save the post to keep this file attached.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function moderate(id: string, approve: boolean) {
    setBusy(true);
    try {
      const query = approve
        ? getSupabase()!
            .from("comments")
            .update({ approved: true })
            .eq("id", id)
        : getSupabase()!.from("comments").delete().eq("id", id);
      const { error } = await query;
      if (error) throw error;
      await load();
      setMessage(approve ? "Comment approved." : "Comment removed.");
    } catch {
      setMessage("Couldn’t update this comment.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (dirty && !window.confirm("Discard unsaved changes and sign out?"))
      return;
    const { error } = await getSupabase()!.auth.signOut();
    if (error) setMessage("Couldn’t sign out. Please try again.");
    else {
      setAccess("login");
      setCurrent(null);
      setPosts([]);
      setPending([]);
      setDirty(false);
    }
  }
  if (access !== "admin")
    return (
      <main className="studio-login">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> Back to the portfolio
        </Link>
        <Asterisk className="login-star" size={65} />
        <span className="eyebrow">YOUR LITTLE CREATIVE CORNER</span>
        <h1>Writing studio.</h1>
        {access === "loading" ? (
          <p>Opening the studio…</p>
        ) : access === "denied" ? (
          <>
            <p>
              This account doesn’t have publishing access. Add your owner
              account using the database setup instructions.
            </p>
            <button className="button dark" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <form onSubmit={login}>
            <p>Sign in to write, publish, and make your ideas public.</p>
            <label>
              Email address
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button className="button dark" disabled={busy}>
              Open my studio <ArrowUpRight size={18} />
            </button>
          </form>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </main>
    );
  return (
    <div className="studio-layout">
      <aside className="studio-sidebar">
        <Link className="wordmark" href="/">
          <Asterisk size={25} /> raghav<span>baghla.</span>
        </Link>
        <span className="eyebrow">WRITING STUDIO</span>
        <button className="button dark" onClick={() => choose(fresh())}>
          <Plus size={17} /> New idea
        </button>
        <div className="studio-tabs">
          <button
            className={tab === "posts" ? "active" : ""}
            onClick={() => setTab("posts")}
          >
            <PenLine size={16} /> My posts <span>{posts.length}</span>
          </button>
          <button
            className={tab === "comments" ? "active" : ""}
            onClick={() => setTab("comments")}
          >
            <Check size={16} /> Comments <span>{pending.length}</span>
          </button>
        </div>
        <div className="studio-posts">
          {posts.map((p) => (
            <div key={p.id} className={current?.id === p.id ? "selected" : ""}>
              <button
                onClick={() => {
                  choose(p);
                  setTab("posts");
                }}
              >
                <strong>{p.title}</strong>
                <span>
                  {p.published ? "Published" : "Draft"} · {p.category}
                </span>
              </button>
              <button
                aria-label={`Delete ${p.title}`}
                disabled={busy}
                onClick={() => void remove(p)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!posts.length && (
            <p>
              Your ideas will live here.
              <br />
              Start with a new one.
            </p>
          )}
        </div>
        <Link className="back-link" href="/">
          <ArrowLeft size={16} /> View portfolio
        </Link>
        {!demo && (
          <button className="back-link" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
        )}
      </aside>
      <main className="studio-main">
        <header className="studio-heading">
          <div>
            <span className="eyebrow">
              {tab === "comments"
                ? "KEEP THE CONVERSATION GOOD"
                : "A BLANK PAGE, A NEW POSSIBILITY"}
            </span>
            <h1>
              {tab === "comments" ? "A few thoughts." : "Make it your own."}
            </h1>
          </div>
          <span className="status-pill">
            {demo ? "Local preview" : dirty ? "Unsaved changes" : "Connected"}
          </span>
        </header>
        {demo && (
          <div className="setup-banner">
            <strong>Your studio is ready to explore.</strong>
            <span>
              Text drafts save in this browser. Publishing, media uploads,
              likes, and comments need Supabase and R2. Setup instructions are
              in the repository README.
            </span>
          </div>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {tab === "comments" ? (
          <section className="moderation">
            {pending.length === 0 && (
              <div className="empty-state">
                All caught up. No comments waiting for approval.
              </div>
            )}
            {pending.map((c) => (
              <article key={c.id} className="comment">
                <span className="eyebrow">
                  {posts.find((p) => p.id === c.post_id)?.title ?? "Post"}
                </span>
                <h3>{c.name}</h3>
                <p>{c.body}</p>
                <div className="action-row">
                  <button
                    className="button dark"
                    disabled={busy}
                    onClick={() => void moderate(c.id, true)}
                  >
                    <Check size={16} /> Approve
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void moderate(c.id, false)}
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          current && (
            <>
              <div className="studio-actions">
                <button className="button" onClick={() => setPreview(!preview)}>
                  <Eye size={16} />
                  {preview ? "Back to writing" : "Preview"}
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void save(false)}
                >
                  <Save size={16} />
                  {current.published ? "Save & unpublish" : "Save draft"}
                </button>
                <button
                  className="button dark"
                  disabled={busy || demo}
                  onClick={() => void save(true)}
                >
                  <Send size={16} />
                  {current.published ? "Update post" : "Publish post"}
                </button>
              </div>
              {current.published && (
                <Link
                  className="back-link"
                  href={`/work/${current.slug}`}
                  target="_blank"
                >
                  View published post <ArrowUpRight size={14} />
                </Link>
              )}
              {preview ? (
                <article className="studio-preview">
                  <span className="eyebrow">{current.category} · PREVIEW</span>
                  <h1>{current.title || "Your title goes here"}</h1>
                  <p className="article-excerpt">{current.excerpt}</p>
                  {current.cover_url && (
                    <img
                      className="article-cover"
                      src={current.cover_url}
                      alt={current.title}
                    />
                  )}
                  <div className="prose">
                    <RichContent node={current.content} />
                  </div>
                  {current.attachments.map((a) => (
                    <a
                      key={a.url}
                      className="back-link"
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Paperclip size={16} />
                      {a.name}
                    </a>
                  ))}
                </article>
              ) : (
                <div className="compose">
                  <label className="title-label">
                    Give it a headline
                    <input
                      className="title-input"
                      value={current.title}
                      maxLength={200}
                      placeholder="A thought worth sharing."
                      onChange={(e) => update({ title: e.target.value })}
                    />
                  </label>
                  <label>
                    A little introduction
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={current.excerpt}
                      placeholder="Set the scene in a sentence or two…"
                      onChange={(e) => update({ excerpt: e.target.value })}
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Category
                      <select
                        value={current.category}
                        onChange={(e) => update({ category: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Post URL
                      <input
                        value={current.slug}
                        maxLength={200}
                        placeholder="Created from your headline"
                        onChange={(e) => update({ slug: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="colour-row">
                    <span>Pick a little colour</span>
                    {colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`${c} card colour`}
                        aria-pressed={current.color === c}
                        className={`colour-swatch ${c} ${current.color === c ? "chosen" : ""}`}
                        onClick={() => update({ color: c })}
                      >
                        {current.color === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                  <div className="cover-upload">
                    {current.cover_url ? (
                      <>
                        <img src={current.cover_url} alt="Post cover" />
                        <button
                          className="button"
                          onClick={() => update({ cover_url: null })}
                        >
                          <X size={16} /> Remove cover
                        </button>
                      </>
                    ) : (
                      <label className="upload-label">
                        <Plus size={22} />
                        <strong>Add a cover image</strong>
                        <span>
                          JPG, PNG or WebP. Images are resized and compressed.
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(e) => {
                            void upload(e.target.files?.[0], true);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <label>Tell your story</label>
                  <Editor
                    key={editorKey}
                    initial={current.content}
                    onChange={(content) => update({ content })}
                    demo={demo}
                  />
                  <section className="compose-attachments">
                    <label className="button file-button">
                      <Paperclip size={16} /> Attach a file
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp"
                        disabled={busy}
                        onChange={(e) => {
                          void upload(e.target.files?.[0], false);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <span className="muted">
                      PDF, DOCX, TXT or images · up to 20 MB
                    </span>
                    {current.attachments.map((a) => (
                      <div className="attached-file" key={a.url}>
                        <Paperclip size={16} />
                        <span>{a.name}</span>
                        <button
                          aria-label={`Remove ${a.name}`}
                          onClick={() =>
                            update({
                              attachments: current.attachments.filter(
                                (f) => f.url !== a.url,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </section>
                  <p className="muted small">
                    Media is uploaded to a public media bucket. Keep
                    confidential material out of uploads. Removing an attachment
                    here does not delete the file from R2.
                  </p>
                </div>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
