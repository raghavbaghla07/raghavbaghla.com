import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Asterisk } from "lucide-react";
import { Header, Footer } from "@/components/header";
import { WorkGrid } from "@/components/work-grid";
import { getPosts } from "@/lib/posts";
import { configured, safeUrl } from "@/lib/content";
export const dynamic = "force-dynamic";
export default async function Home() {
  const posts = await getPosts();
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const social = safeUrl(
    process.env.NEXT_PUBLIC_LINKEDIN_URL ??
      "https://www.linkedin.com/in/raghavbaghla07",
  );
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="little-dot" /> WORDS. IDEAS. A LITTLE DIFFERENT.
            </span>
            <h1>
              Good words.
              <br />
              Better <span className="serif-word">stories.</span>
            </h1>
            <p>
              I’m Raghav. This is my corner of the internet
              <br className="desktop-break" /> for creative copy, social posts,
              and ideas
              <br className="desktop-break" /> that deserve a little space.
            </p>
            <Link className="button dark" href="#work">
              Explore my work <ArrowDownRight size={19} />
            </Link>
            <div className="hero-caption">
              A creative portfolio, one idea at a time.
            </div>
          </div>
          <div
            className="hero-collage"
            aria-label="A playful collage of words and ideas"
          >
            <div className="paper paper-back">
              <span>NOTE TO SELF / 001</span>
              <p>
                Make it
                <br />
                mean
                <br />
                <em>something.</em>
              </p>
              <span className="paper-star">✳</span>
            </div>
            <div className="paper paper-front">
              <span>A THOUGHT WORTH KEEPING</span>
              <p>
                Less noise.
                <br />
                More <em>feeling.</em>
              </p>
              <div className="scribble" aria-hidden="true" />
              <span>WORDS THAT STICK WITH YOU.</span>
            </div>
            <div className="sticker">
              a little
              <br />
              wordplay
              <br />
              <Asterisk size={26} />
            </div>
            <span className="collage-note">Ideas live here. ↗</span>
          </div>
        </section>
        <div className="ticker" aria-hidden="true">
          CREATIVE COPY <Asterisk /> SOCIAL STORIES <Asterisk /> FRESH
          PERSPECTIVES <Asterisk /> IDEAS THAT STICK <Asterisk />
        </div>
        <WorkGrid posts={posts} demo={!configured} />
        <section className="about-section" id="about">
          <div className="about-mark" aria-hidden="true">
            hello<span>✳</span>
          </div>
          <div>
            <span className="eyebrow">A LITTLE ABOUT ME</span>
            <h2>
              Curious mind.
              <br />
              Always finding the words.
            </h2>
            <p>
              I’m Raghav Baghla. I use this space to share my creative work and
              explore the possibilities of a well-chosen word. From a short
              social caption to a bigger campaign idea, it all starts with a
              thought.
            </p>
            <p className="muted">
              Work is presented without brand identifiers. Self-initiated
              concepts are labelled as such.
            </p>
          </div>
        </section>
        <section className="contact-section" id="contact">
          <span className="eyebrow">
            THE NEXT GOOD IDEA STARTS WITH A HELLO
          </span>
          <h2>
            Let’s make
            <br />
            <span className="serif-word">something</span> stick.
          </h2>
          {contact ? (
            <a className="button dark" href={`mailto:${contact}`}>
              Say hello <ArrowUpRight size={19} />
            </a>
          ) : (
            <p>Contact details are coming soon.</p>
          )}
          {social && (
            <a
              className="social-link"
              href={social}
              target="_blank"
              rel="noopener noreferrer"
            >
              Find me on LinkedIn <ArrowUpRight size={16} />
            </a>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
