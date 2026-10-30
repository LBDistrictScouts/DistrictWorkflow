import Link from "next/link";

export default function NotFound() {
  return <div className="section container empty-state"><p className="eyebrow">404 · Page not found</p><h1>Let’s get you back on track.</h1><p>We couldn’t find the page you’re looking for.</p><Link className="button" href="/">Back to overview →</Link></div>;
}
