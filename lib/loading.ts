type Listener = (visible: boolean) => void;

let pending = 0;
let visible = false;
const listeners = new Set<Listener>();
let patched = false;
let showTimer: ReturnType<typeof setTimeout> | null = null;
const SHOW_DELAY_MS = 280;

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
  if (visible || showTimer) return;
  showTimer = setTimeout(() => {
    showTimer = null;
    if (pending > 0 && !visible) {
      visible = true;
      emit();
    }
  }, SHOW_DELAY_MS);
}

export function endLoading(): void {
  pending = Math.max(0, pending - 1);
  if (pending > 0) return;
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (visible) {
    visible = false;
    emit();
  }
}

export function shouldTrackLoading(raw: string, method = "GET"): boolean {
  const url = String(raw || "").split("?")[0];
  if (!url) return false;
  if (/\/_next\/(static|image|webpack)/.test(url)) return false;
  if (url.includes("hot-update")) return false;
  if (/\.(css|js|map|woff2?|png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(url)) return false;
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return false;
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

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof Request !== "undefined" && input instanceof Request) return input.method;
  return "GET";
}

function silentHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
  const raw = init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  try {
    return new Headers(raw).get("X-Silent-Loading") === "1";
  } catch {
    return false;
  }
}

export function installFetchLoadingGuard(): () => void {
  if (typeof window === "undefined" || patched) {
    return () => undefined;
  }
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const skip = silentHeader(input, init);
    const track = !skip && shouldTrackLoading(requestUrl(input), requestMethod(input, init));
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
