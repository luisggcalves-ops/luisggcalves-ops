import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers only honour HSTS over https, so it's harmless on local http.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// GitHub Codespaces serves the app through *.app.github.dev. Allow that origin only when running there.
const codespaceOrigins = process.env.CODESPACES === "true" ? ["*.app.github.dev"] : [];

const nextConfig: NextConfig = {
  // Every BarberOS screen is authenticated and database-driven, so we use classic
  // request-time rendering. Cache Components can be adopted later, route by route.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  allowedDevOrigins: codespaceOrigins,
  experimental: {
    serverActions: { allowedOrigins: codespaceOrigins },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
