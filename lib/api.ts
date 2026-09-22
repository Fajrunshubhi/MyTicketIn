export type ApiError = {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string>;
    correlationId?: string;
  };
};

export async function getCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
  const data = (await res.json()) as { csrfToken?: string };
  return data.csrfToken || "";
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    if (!headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", await getCsrfToken());
    }
  }
  return fetch(path, { ...init, headers, credentials: "include", cache: "no-store" });
}

export function readApiError(payload: unknown, fallback: string): string {
  const body = payload as ApiError;
  const base = body.error?.message || fallback;
  if (body.error?.correlationId && (body.error.code === "INTERNAL_ERROR" || body.error.code === "SERVICE_UNHEALTHY")) {
    return `${base} (ID ${body.error.correlationId})`;
  }
  return base;
}
