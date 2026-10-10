import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  distDir: process.env.SIKEPEL_BUILD_DIR || ".next",
  turbopack: {
    root: path.resolve(__dirname, "..", ".."),
  },
  outputFileTracingIncludes: {
    "/api/*": ["./templates/pernyataan-belum-menikah.docx"],
  },
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.tools/**/*", "./reference/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  serverExternalPackages: [
    "@electric-sql/pglite",
    "pg",
    "docxtemplater",
    "pizzip",
    "docx",
  ],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default config;
