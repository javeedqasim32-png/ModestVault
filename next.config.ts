import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const s3Bucket = process.env.AWS_S3_BUCKET_NAME || "modaire";
const s3Region = process.env.AWS_REGION || "us-east-1";
const customImageBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
const customImageHost = customImageBaseUrl ? new URL(customImageBaseUrl).hostname : null;
const projectRoot = dirname(fileURLToPath(import.meta.url));

// Baseline hardening headers. Deliberately no Content-Security-Policy yet —
// Stripe / Cloudflare / inline scripts need a dedicated, tested policy.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Prod is HTTPS-only behind Cloudflare; one year, no preload/includeSubDomains
  // so an HTTP-only subdomain can't be broken by this header.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: `${s3Bucket}.s3.${s3Region}.amazonaws.com`,
      },
      ...(customImageHost
        ? [
          {
            protocol: "https" as const,
            hostname: customImageHost,
          },
        ]
        : []),
    ],
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ]
  },
};

export default nextConfig;
