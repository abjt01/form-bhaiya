import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap narrow notfound">
      <h1>Nothing here.</h1>
      <p className="lede">This notice isn&apos;t in the library. It may have been read on a server that has since restarted.</p>
      <Link className="btn" href="/">
        Back to the notices
      </Link>
    </main>
  );
}
