/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  distDir: process.env.THEORYFOUNDRY_NEXT_DIST_DIR ?? ".next",
  logging: { incomingRequests: { ignore: [/\/v1\/exports\//] } },
  transpilePackages: ["@theoryfoundry/contracts"],
};

export default nextConfig;
