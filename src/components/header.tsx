import Link from "next/link";
export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark">
        raghav<span>baghla.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#work">Selected work</Link>
        <Link href="/#about">About me</Link>
        <Link className="nav-contact" href="/#contact">
          Let’s talk
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
        Writing studio
      </Link>
    </footer>
  );
}
