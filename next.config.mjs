import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api = (process.env.API_ORIGIN || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8080").replace(
      /\/$/,
      "",
    );
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/uploads/:path*", destination: `${api}/uploads/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: "/organizer/events/:id/preview", destination: "/dashboard/event/:id/preview", permanent: false },
      { source: "/organizer/events/:id/staff", destination: "/dashboard/event/:id/staff", permanent: false },
      { source: "/organizer/events/:id/scanner", destination: "/dashboard/event/:id/scanner", permanent: false },
      { source: "/organizer/events/:id/check-in-attempts", destination: "/dashboard/event/:id/check-in-attempts", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.google.co.id; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; media-src 'self' blob:; frame-src 'self' https://www.google.com https://maps.google.com https://www.google.co.id; child-src 'self' https://www.google.com https://maps.google.com https://www.google.co.id; frame-ancestors 'none'; base-uri 'self'",
          },
        ],
      },
      {
        source: "/organizer/events/:id/scanner",
        headers: [{ key: "Permissions-Policy", value: "camera=(self)" }],
      },
      {
        source: "/dashboard/event/:id/scanner",
        headers: [{ key: "Permissions-Policy", value: "camera=(self)" }],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias["@"] = __dirname;
    return config;
  },
};

export default nextConfig;
