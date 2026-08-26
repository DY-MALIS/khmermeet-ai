import type { NextConfig } from "next";

if (process.env.NEXTAUTH_URL?.includes("[SENSITIVE]")) {
  process.env.NEXTAUTH_URL = "https://khmermeet-ai.vercel.app";
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },
  // ffmpeg-static resolves its binary's path from its own __dirname at
  // runtime. Confirmed live in production: webpack bundling that module
  // into the route's single chunk file rewrites __dirname to point at
  // .next/server/chunks instead of the real node_modules/ffmpeg-static
  // directory, so the binary is never found (ENOENT) even though the file
  // genuinely exists in the deployment - excluding it from the webpack
  // bundle keeps its own real __dirname intact.
  serverExternalPackages: ["ffmpeg-static"],
  // Vercel's build-time file tracer can't always follow ffmpeg-static's
  // runtime (os.platform()-dependent) path to its binary statically -
  // without this, the Linux binary can get left out of the deployed
  // function entirely. Including the whole package directory covers every
  // platform binary it ships, not just the one this happens to run on.
  outputFileTracingIncludes: {
    "/api/meetings/[id]/transcribe": ["./node_modules/ffmpeg-static/**"],
    "/api/meetings/[id]/transcribe-stored-segment": ["./node_modules/ffmpeg-static/**"],
    "/api/meetings/[id]/merge-transcript": ["./node_modules/ffmpeg-static/**"]
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
      // Vercel CLI masks sensitive pulled env vars as "[SENSITIVE]" for local
      // builds. next-auth/react parses NEXTAUTH_URL at import time, so keep the
      // browser bundle on same-origin auth URLs and let the server use the real
      // runtime value.
      config.plugins.push(
        new webpack.DefinePlugin({
          "process.env.NEXTAUTH_URL": JSON.stringify(process.env.NEXTAUTH_URL ?? "https://khmermeet-ai.vercel.app")
        })
      );
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

