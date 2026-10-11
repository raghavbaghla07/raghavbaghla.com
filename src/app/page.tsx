import { Header, Footer } from "@/components/header";
import { WorkGrid } from "@/components/work-grid";
import { getPosts } from "@/lib/posts";
import { configured, safeUrl, type PostSummary } from "@/lib/content";
import { OpeningSequence } from "@/components/opening-sequence";
export const dynamic = "force-dynamic";
export default async function Home() {
  let posts: PostSummary[] = [];
  let workUnavailable = false;
  try {
    posts = configured ? await getPosts() : [];
  } catch {
    workUnavailable = true;
  }
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const social = safeUrl(process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "https://www.linkedin.com/in/raghavbaghla07");
  return (
    <OpeningSequence>
      <main className="text-portfolio">
        <section className="text-intro" aria-labelledby="intro-title">
          <h1 id="intro-title" aria-label="Hi, I'm Raghav Baghla.">
            <span className="text-line"><span className="text-arrival">Hi, I’m</span></span>
            <span className="text-line"><span className="text-arrival">Raghav</span></span>
            <span className="text-line"><span className="text-arrival">Baghla.</span></span>
          </h1>
        </section>
        <Header />
        {workUnavailable ? (
          <section id="work" className="work-section">
            <h2>Selected writing</h2>
            <p className="empty-state">Writing is temporarily unavailable. Please check back soon.</p>
          </section>
        ) : <WorkGrid posts={posts} demo={false} />}
        <section className="text-about" id="about" data-reveal>
          <h2>About</h2>
          <p>I’m Raghav Baghla. I write copy, tell stories, and follow ideas wherever they lead.</p>
        </section>
        <section className="text-contact" id="contact" data-reveal>
          <h2>Let’s talk.</h2>
          {contact && <a href={`mailto:${contact}`}>{contact}</a>}
          {social && <a href={social} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
        </section>
      </main>
      <Footer />
    </OpeningSequence>
  );
}
