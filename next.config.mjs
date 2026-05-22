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
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
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
        source: "/:path*",
        headers: [
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
        ],
      },
    ];
  },
};

export default nextConfig;
