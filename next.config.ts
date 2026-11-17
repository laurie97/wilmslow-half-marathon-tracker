import type { NextConfig } from "next";

// Bake the hosting platform flags into the build, so demo mode can never switch
// on in a hosted deployment even if a flag is only set while building.
const HOST_FLAGS = ["NETLIFY", "VERCEL"];
const hostEnv: Record<string, string> = {};
for (const name of HOST_FLAGS) {
  const value = process.env[name];
  if (value) {
    hostEnv[name] = value;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: hostEnv,
};

export default nextConfig;
