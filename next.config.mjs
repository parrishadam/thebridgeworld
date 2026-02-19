/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force Next.js to transpile these packages so webpack uses their
  // Node.js-compatible builds instead of the browser bundles.
  transpilePackages: ["@sanity/client", "@sanity/ui", "next-sanity"],
};

export default nextConfig;
