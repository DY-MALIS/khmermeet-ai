// Runs before `next build` (see package.json). The voice model's runtime,
// onnxruntime-node, ships native libraries for every platform, and on Linux
// its installer can add ~300 MB of GPU (CUDA/TensorRT) libraries. Vercel's
// file tracer copies every file in the native binding's folder into each
// function that uses it, and exclude rules did not stop that - one function
// reached 372 MB against Vercel's 250 MB limit. On the Linux build machine,
// delete everything the CPU runtime does not load, so it cannot be copied.
// Elsewhere (a developer's Windows or Mac) this does nothing.
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const bin = path.join(process.cwd(), "node_modules", "onnxruntime-node", "bin", "napi-v3");
const keepDir = path.join(bin, "linux", "x64");
// What onnxruntime_binding.node loads on Linux x64 (it links libonnxruntime.so.1).
const keepFiles = new Set(["onnxruntime_binding.node", "libonnxruntime.so.1", "libonnxruntime_providers_shared.so"]);

if (process.platform !== "linux" || process.arch !== "x64") {
  console.log("trim-onnxruntime: not Linux x64, nothing to trim");
} else {
  const removed = [];
  for (const platform of await readdir(bin).catch(() => [])) {
    for (const arch of await readdir(path.join(bin, platform)).catch(() => [])) {
      const dir = path.join(bin, platform, arch);
      if (dir !== keepDir) {
        await rm(dir, { recursive: true, force: true });
        removed.push(`${platform}/${arch}`);
        continue;
      }
      for (const file of await readdir(dir)) {
        if (keepFiles.has(file)) continue;
        await rm(path.join(dir, file), { recursive: true, force: true });
        removed.push(`${platform}/${arch}/${file}`);
      }
    }
  }
  const present = await readdir(keepDir).catch(() => []);
  const missing = [...keepFiles].filter((file) => !present.includes(file));
  console.log("trim-onnxruntime: removed", removed.length ? removed.join(", ") : "nothing");
  // Better a failed build than a deployment where voice memory cannot load.
  if (missing.length) throw new Error(`trim-onnxruntime: runtime files missing: ${missing.join(", ")}`);
}
