/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@rjls/contracts"],
};

export default nextConfig;
