import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Two independent bun.lock files live in this repo (library root + website),
  // so root inference walks up to the library. Pin it here: morphicons is
  // consumed as the real npm package (publish.yml bumps the pin on each
  // release), not as workspace source.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
