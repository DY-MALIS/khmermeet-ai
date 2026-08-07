import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },
  webpack: (config, { isServer, webpack }) => {
    // Both pptxgenjs's ESM build and its prebuilt browser bundle contain
    // guarded `require("node:fs"/"node:https")` calls for a Node-only
    // codepath that never runs in the browser. Webpack still tries to
    // statically resolve the "node:" URI scheme and fails, so ignore those
    // specifiers outright for the client bundle instead of resolving them.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        pptxgenjs$: path.resolve(__dirname, "node_modules/pptxgenjs/dist/pptxgen.bundle.js")
      };
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
