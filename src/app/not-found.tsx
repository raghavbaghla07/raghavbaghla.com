import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-state">
      <h1>This idea isn’t here.</h1>
      <p>The post may have moved or hasn’t been published yet.</p>
      <Link className="button dark" href="/">
        Back to the portfolio
      </Link>
    </main>
  );
}
