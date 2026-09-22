import { lookupError } from "@/lib/errors/error-catalog";

export type MappedError = {
  title: string;
  recovery: string;
  correlationId?: string;
  category: string;
};

export function mapApiError(payload: unknown, fallback: string, correlationHeader?: string | null): MappedError {
  const body = payload as {
    error?: { code?: string; message?: string; correlationId?: string };
  };
  const code = body.error?.code;
  const entry = lookupError(code);
  return {
    title: body.error?.message || fallback || entry.message,
    recovery: entry.recovery,
    correlationId: body.error?.correlationId || correlationHeader || undefined,
    category: entry.category,
  };
}

export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError;
}
