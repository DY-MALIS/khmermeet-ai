import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },
  webpack: (config, { isServer, webpack }) => {
    // pptxgenjs's ESM build contains guarded `require("node:fs"/"node:https")`
    // calls for a Node-only codepath that never runs in the browser. Webpack
    // still tries to statically resolve the "node:" URI scheme and fails, so
    // ignore those specifiers outright for the client bundle instead of
    // resolving them. (Do NOT alias to pptxgenjs's prebuilt UMD "browser
    // bundle" instead - its export shape doesn't match `.default` cleanly
    // and it silently breaks PptxGenJS's constructor at runtime.)
    if (!isServer) {
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:/ }));
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self)"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
