import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const distDir = path.join(projectDir, "dist");

function resolveRevision() {
  const explicitRevision =
    process.env.VITE_APP_REVISION?.trim() || process.env.GITHUB_SHA?.trim();
  if (explicitRevision) {
    return explicitRevision;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
}

const payload = {
  revision: resolveRevision(),
  builtAt: new Date().toISOString(),
};

await mkdir(distDir, { recursive: true });
await writeFile(
  path.join(distDir, "build-meta.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote dist/build-meta.json for revision ${payload.revision}`);
