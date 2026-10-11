import Link from "next/link";
import { ArrowUpRight, Asterisk } from "lucide-react";
export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark">
        <Asterisk size={30} strokeWidth={2.5} /> raghav<span>baghla.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#work">Selected work</Link>
        <Link href="/#about">About me</Link>
        <Link className="nav-contact" href="/#contact">
          Let’s talk <ArrowUpRight size={16} />
        </Link>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} Raghav Baghla</span>
      <span>Made of words. And a little curiosity.</span>
      <Link href="/studio">
        Writing studio <ArrowUpRight size={14} />
      </Link>
    </footer>
  );
}
