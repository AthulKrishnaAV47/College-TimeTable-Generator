import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  outputFileTracingIncludes: { "/api/parse": ["./src/lib/server/pdf-worker.mjs", "./node_modules/unpdf/**/*"] },
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }];
  },
};
export default withSentryConfig(nextConfig, { silent: true, sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN }, telemetry: false });
