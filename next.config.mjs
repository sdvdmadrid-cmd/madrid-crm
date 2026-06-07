const isProd = process.env.NODE_ENV === "production";
const cspScriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline' https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://plausible.io"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://plausible.io";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  cspScriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://*.upstash.io https://challenges.cloudflare.com https://www.google-analytics.com https://plausible.io",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "upgrade-insecure-requests",
].join("; ");

const buildSha = String(
  process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.GITHUB_SHA ||
    "local",
).slice(0, 12);

const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: CONTENT_SECURITY_POLICY,
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
  },
  serverExternalPackages: ["pdfkit"],
  reactCompiler: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/website-builder",
        destination: "/website",
        permanent: true,
      },
      {
        source: "/site/:slug",
        destination: "/sites/:slug",
        permanent: true,
      },
      {
        source: "/site/:slug/request",
        destination: "/sites/:slug/request",
        permanent: true,
      },
      {
        source: "/admin",
        destination: "/owner/overview",
        permanent: false,
      },
      {
        source: "/dev/admin",
        destination: "/owner/overview",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sites/:path*",
        headers: [
          ...SECURITY_HEADERS,
          {
            key: "Cache-Control",
            value: "public, s-maxage=120, stale-while-revalidate=600",
          },
        ],
      },
      {
        source: "/",
        headers: [
          ...SECURITY_HEADERS,
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/api/health",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
