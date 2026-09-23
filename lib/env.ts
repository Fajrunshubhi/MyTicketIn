function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

/**
 * Origin for server-side fetch to Route Handlers on this Next.js app.
 * Browser traffic stays same-origin (`/api/...`).
 */
export function getPublicApiBaseUrl(): string {
  const vercel = String(process.env.VERCEL_URL || "").trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "")}`;
  }
  const web = trimOrigin(String(process.env.WEB_ORIGIN || process.env.APP_ORIGIN || ""));
  if (web) {
    return web;
  }
  return "http://127.0.0.1:3000";
}

export function appVersion(): string {
  return String(process.env.APP_VERSION || process.env.npm_package_version || "0.1.0");
}

export function appEnv(): string {
  return String(process.env.APP_ENV || process.env.NODE_ENV || "development");
}
