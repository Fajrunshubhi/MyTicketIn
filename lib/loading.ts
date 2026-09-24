type Listener = (visible: boolean) => void;

let pending = 0;
let visible = false;
const listeners = new Set<Listener>();
let patched = false;

function emit(): void {
  for (const fn of listeners) fn(visible);
}

export function subscribeLoading(fn: Listener): () => void {
  listeners.add(fn);
  fn(visible);
  return () => {
    listeners.delete(fn);
  };
}

export function beginLoading(): void {
  pending += 1;
  if (!visible) {
    visible = true;
    emit();
  }
}

export function endLoading(): void {
  pending = Math.max(0, pending - 1);
  if (pending === 0 && visible) {
    visible = false;
    emit();
  }
}

export function shouldTrackLoading(raw: string): boolean {
  const url = String(raw || "").split("?")[0];
  if (!url) return false;
  if (/\/_next\/(static|image|webpack)/.test(url)) return false;
  if (url.includes("hot-update")) return false;
  if (/\.(css|js|map|woff2?|png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(url)) return false;
  if (url.startsWith("/api/") || url.includes("/api/")) return true;
  if (url.startsWith("/") || (typeof window !== "undefined" && url.startsWith(window.location.origin))) {
    return true;
  }
  return false;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function installFetchLoadingGuard(): () => void {
  if (typeof window === "undefined" || patched) {
    return () => undefined;
  }
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const track = shouldTrackLoading(requestUrl(input));
    if (track) beginLoading();
    try {
      return await original(input, init);
    } finally {
      if (track) endLoading();
    }
  };
  return () => {
    window.fetch = original;
    patched = false;
  };
}
