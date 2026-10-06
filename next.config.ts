import type { NextConfig } from "next";

function deploymentAuthUrl() {
  const explicitUrl = process.env.NEXTAUTH_URL?.trim();
  if (explicitUrl && !explicitUrl.includes("[SENSITIVE]")) return explicitUrl;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return "https://khmermeet-ai.vercel.app";
}

const authUrl = deploymentAuthUrl();

if (!process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("[SENSITIVE]")) {
  process.env.NEXTAUTH_URL = authUrl;
}

const voiceModelRuntime = [
  "./node_modules/onnxruntime-node/dist/**",
  "./node_modules/onnxruntime-node/package.json",
  "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
  "./node_modules/onnxruntime-common/**"
];

const nextConfig: NextConfig = {
  agentRules: false,
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
  // onnxruntime-node (the voice model's runtime, lib/voice) loads its native
  // binary by a path built from the platform at runtime - same problem.
  serverExternalPackages: ["ffmpeg-static", "onnxruntime-node"],
  // Vercel's build-time file tracer can't always follow ffmpeg-static's
  // runtime (os.platform()-dependent) path to its binary statically -
  // without this, the Linux binary can get left out of the deployed
  // function entirely. Including the whole package directory covers every
  // platform binary it ships, not just the one this happens to run on.
  outputFileTracingIncludes: {
    "/api/meetings/[id]/transcribe": ["./node_modules/ffmpeg-static/**", ...voiceModelRuntime],
    "/api/meetings/[id]/transcribe-stored-segment": ["./node_modules/ffmpeg-static/**", ...voiceModelRuntime],
    "/api/meetings/[id]/merge-transcript": ["./node_modules/ffmpeg-static/**", ...voiceModelRuntime],
    "/api/voices/selftest": [...voiceModelRuntime]
  },
  // onnxruntime-node ships binaries for every platform (208 MB); Vercel runs
  // Linux x64, so only that one (43 MB) is deployed.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/onnxruntime-node/bin/napi-v3/win32/**",
      "./node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**"
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            // bluetooth=(self) lets the recorder open Chrome's nearby-device
            // chooser; left out, a stricter browser default could block it.
            value: "camera=(self), microphone=(self), display-capture=(self), bluetooth=(self)"
          }
        ]
      }
    ];
  }
};

export default nextConfig;

