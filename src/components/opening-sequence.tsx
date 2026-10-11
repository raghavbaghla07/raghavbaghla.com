"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function OpeningSequence({ children }: { children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("text-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    const elements = surface.current?.querySelectorAll("[data-reveal]");
    elements?.forEach((element) => {
      element.classList.add("text-pending");
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
      elements?.forEach((element) => element.classList.remove("text-pending"));
    };
  }, []);
  return <div ref={surface} className="portfolio-surface">{children}</div>;
}
