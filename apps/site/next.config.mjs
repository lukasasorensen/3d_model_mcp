/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  // Preserve exact OAuth callback URLs; normalization can rewrite loopback hosts in queries.
  skipMiddlewareUrlNormalize: true,
  distDir: process.env.THEORYFOUNDRY_NEXT_DIST_DIR ?? ".next",
  logging: { incomingRequests: { ignore: [/\/v1\/exports\//] } },
  transpilePackages: ["@theoryfoundry/contracts"],
};

export default nextConfig;
