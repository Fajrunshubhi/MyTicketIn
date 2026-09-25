import Link from "next/link";

export default function BrandMark({
  compact = false,
  onDark = false,
  markOnly = false,
  href = "/",
}: {
  compact?: boolean;
  onDark?: boolean;
  markOnly?: boolean;
  href?: string | null;
}) {
  const mark = (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${onDark ? "bg-white/15 text-white" : "bg-gold-500 text-white"}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A2 2 0 0 1 3.5 17V10"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path d="M8 10h8M8 13.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </div>
  );
  if (markOnly) {
    return mark;
  }
  const body = (
    <>
      {mark}
      <div className="min-w-0">
        <p className={`truncate text-xl font-semibold tracking-tight ${onDark ? "text-white" : "text-ink"}`}>MYTICKETIN</p>
        <p className={`hidden truncate text-md sm:block ${onDark ? "text-white/70" : "text-ink/60"}`}>Event Ticketing</p>
      </div>
    </>
  );
  const className = `flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
    onDark ? "focus-visible:outline-white" : "focus-visible:outline-gold-400"
  } ${compact ? "" : "mb-8"}`;
  if (!href) {
    return <div className={className}>{body}</div>;
  }
  return (
    <Link href={href} className={className} aria-label="Beranda MyTicketIn">
      {body}
    </Link>
  );
}
