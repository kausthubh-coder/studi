import type { NextConfig } from "next";

const clerkOrigins = [
  "https://*.accounts.dev",
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  "https://api.clerk.com",
  "https://accounts.getstudi.com",
  "https://clerk.getstudi.com",
];

// Clerk Billing mounts Stripe.js and Payment Element frames from these
// origins. Keep this aligned with the CSP defaults shipped by @clerk/nextjs.
const stripeScriptOrigins = [
  "https://*.js.stripe.com",
  "https://js.stripe.com",
];
const stripeFrameOrigins = [
  ...stripeScriptOrigins,
  "https://hooks.stripe.com",
];

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `form-action 'self' ${clerkOrigins.join(" ")}`,
  [
    "script-src 'self' 'unsafe-inline'",
    ...(isProduction ? [] : ["'unsafe-eval'"]),
    "blob:",
    ...clerkOrigins,
    "https://challenges.cloudflare.com",
    "https://tally.so",
    "https://www.desmos.com",
    "https://cdn.jsdelivr.net",
    ...stripeScriptOrigins,
    "https://maps.googleapis.com",
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  [
    "connect-src 'self'",
    ...(isProduction ? [] : ["http:", "ws:"]),
    "https://*.convex.cloud",
    "wss://*.convex.cloud",
    "https://*.convex.site",
    ...clerkOrigins,
    "https://*.clerk-telemetry.com",
    "https://clerk-telemetry.com",
    "https://img.clerk.com",
    "https://images.clerkstage.dev",
    "https://challenges.cloudflare.com",
    "https://www.desmos.com",
    "https://cdn.jsdelivr.net",
    "https://api.stripe.com",
    "https://maps.googleapis.com",
  ].join(" "),
  [
    "frame-src 'self' blob:",
    ...clerkOrigins,
    "https://challenges.cloudflare.com",
    "https://tally.so",
    ...stripeFrameOrigins,
  ].join(" "),
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "manifest-src 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      'accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(self "https://*.js.stripe.com" "https://js.stripe.com" "https://hooks.stripe.com"), usb=()',
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "X-XSS-Protection",
    value: "0",
  },
];

const nextConfig: NextConfig = {
  // Nested verification worktrees can sit below another checkout with its own
  // lockfile. Anchor dependency tracing and module resolution to the checkout
  // that actually invoked Next.
  turbopack: {
    root: process.cwd(),
  },
  ...(isProduction
    ? {}
    : {
        // Playwright and the documented browser runbook use 127.0.0.1 while
        // Next advertises localhost. Keep this exception dev-only.
        allowedDevOrigins: ["127.0.0.1"],
      }),
  headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
