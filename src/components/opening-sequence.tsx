"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Asterisk } from "lucide-react";

const words = ["Fond of", "writing.", "reading.", "learning?", "Let’s gooo."];

export function OpeningSequence({ children }: { children: ReactNode }) {
  const [frame, setFrame] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const enter = useRef<HTMLButtonElement>(null);
  const destination = useRef<HTMLDivElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousOverflow = useRef("");

  useEffect(() => {
    setMounted(true);
    // Section links should take visitors straight to their destination.
    if (window.location.hash) {
      setDismissed(true);
      return;
    }
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    enter.current?.focus({ preventScroll: true });
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers = reduced
      ? [setTimeout(() => setFrame(5), 0)]
      : [650, 1450, 2250, 3150, 4050].map((delay, i) =>
          setTimeout(() => setFrame(i + 1), delay),
        );
    return () => {
      timers.forEach(clearTimeout);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      document.body.style.overflow = previousOverflow.current;
    };
  }, []);

  useEffect(() => {
    if (dismissed && leaving)
      destination.current?.focus({ preventScroll: true });
  }, [dismissed, leaving]);

  function openPortfolio() {
    if (leaving || dismissed) return;
    setLeaving(true);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    exitTimer.current = setTimeout(
      () => {
        setDismissed(true);
        document.body.style.overflow = previousOverflow.current;
      },
      reduced ? 0 : 900,
    );
  }

  return (
    <>
      {!dismissed && (
        <button
          ref={enter}
          type="button"
          className={`opening-screen opening-frame-${frame}${leaving ? " opening-leaving" : ""}`}
          onClick={openPortfolio}
          onKeyDown={(event) => {
            if (event.key === "Escape") openPortfolio();
          }}
          aria-label="Hi, I’m Raghav Baghla. Enter my portfolio."
        >
          <span className="opening-topline" aria-hidden="true">
            <span>
              <Asterisk size={24} /> RAGHAV BAGHLA
            </span>
            <span>A CURIOUS MIND / A CREATIVE SPACE</span>
          </span>
          <span className="opening-orbit" aria-hidden="true" />
          <span className="opening-grid" aria-hidden="true" />
          {frame < 5 ? (
            <span className="opening-cut" key={frame} aria-hidden="true">
              <span className="opening-counter">
                0{frame + 1} / A LITTLE CURIOSITY
              </span>
              <span className="opening-word">{words[frame]}</span>
              <span className="opening-echo">{words[frame]}</span>
              <span className="opening-caption">
                {frame === 0
                  ? "WORDS ARE JUST THE BEGINNING."
                  : frame === 4
                    ? "THERE’S A WHOLE WORLD IN HERE. ↗"
                    : "ONE GOOD IDEA LEADS TO ANOTHER."}
              </span>
            </span>
          ) : (
            <span className="opening-introduction" aria-hidden="true">
              <span className="opening-hello">Hi, I’m</span>
              <span className="opening-name">
                Raghav
                <span>
                  Baghla<span className="opening-period">.</span>
                </span>
              </span>
              <span className="opening-byline">
                A little writing. A little reading. Always learning.
              </span>
            </span>
          )}
          <span className="opening-bottomline" aria-hidden="true">
            <span>WORDS • IDEAS • POSSIBILITIES</span>
            <span className="opening-prompt">
              {frame < 5 ? "SKIP INTRO" : "TAP ANYWHERE TO COME IN"}{" "}
              <ArrowUpRight size={20} />
            </span>
          </span>
          <span className="opening-progress" aria-hidden="true" />
        </button>
      )}
      <div
        ref={destination}
        tabIndex={-1}
        inert={mounted && !dismissed}
        className={`portfolio-surface${leaving ? " portfolio-revealing" : ""}`}
      >
        {children}
      </div>
      <noscript>
        <style>{`.opening-screen { display: none; }`}</style>
      </noscript>
    </>
  );
}
