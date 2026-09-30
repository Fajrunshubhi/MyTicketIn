import Link from "next/link";

export type NotificationHoverData = {
  id: string;
  title: string;
  body: string;
  actionPath?: string | null;
  readAt?: string | null;
};

export function notificationHoverLabel(item: NotificationHoverData): string {
  return `${item.title}. ${item.body}`;
}

export function NotificationHoverItem({
  item,
  fallbackHref,
  compact = false,
  onNavigate,
}: {
  item: NotificationHoverData;
  fallbackHref?: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const href = item.actionPath || fallbackHref;
  const hint = notificationHoverLabel(item);
  const className = `block rounded-xl px-3 py-2.5 text-left transition hover:bg-gold-50 hover:ring-1 hover:ring-gold-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600 ${
    item.readAt ? "bg-transparent" : "bg-gold-50/60"
  }`;
  const inner = (
    <>
      <p className="font-semibold text-ink">{item.title}</p>
      <p className={`mt-0.5 text-sm text-ink/65 ${compact ? "line-clamp-2" : ""}`}>{item.body}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} title={hint} className={className} onClick={onNavigate}>
        {inner}
      </Link>
    );
  }
  return (
    <div title={hint} className={className} tabIndex={0}>
      {inner}
    </div>
  );
}
