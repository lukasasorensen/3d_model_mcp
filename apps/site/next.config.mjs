/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  distDir: process.env.RJLS_NEXT_DIST_DIR ?? ".next",
  logging: { incomingRequests: { ignore: [/\/v1\/exports\//] } },
  transpilePackages: ["@rjls/contracts"],
};

export default nextConfig;
