import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const serviceWorkerEntry = fileURLToPath(new URL("../src/pwa/sw.ts", import.meta.url));

const SHELL_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".ico",
  ".js",
  ".json",
  ".mjs",
  ".png",
  ".svg",
  ".ttf",
  ".webmanifest",
  ".woff",
  ".woff2",
]);

async function collectFiles(directory: string): Promise<string[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    directoryEntries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(absolutePath);
      }

      return entry.isFile() ? [absolutePath] : [];
    }),
  );

  return nestedFiles.flat();
}

function toShellPath(filePath: string, rootDirectory: string): string {
  const relativePath = relative(rootDirectory, filePath).split(sep).join("/");

  if (relativePath === "index.html") {
    return "/";
  }

  if (relativePath.endsWith("/index.html")) {
    return `/${relativePath.slice(0, -"index.html".length)}`;
  }

  return `/${relativePath}`;
}

const outputFiles = await collectFiles(distDirectory);
const shellManifest = outputFiles
  .filter((filePath) => {
    const publicPath = toShellPath(filePath, distDirectory);

    return publicPath !== "/sw.js" && SHELL_EXTENSIONS.has(extname(filePath));
  })
  .map((filePath) => toShellPath(filePath, distDirectory))
  .sort();

const versionTag = `${Date.now()}`;
const manifest = JSON.stringify({ version: versionTag, urls: shellManifest });

const build = await Bun.build({
  entrypoints: [serviceWorkerEntry],
  target: "browser",
  format: "iife",
  define: {
    __SHELL_MANIFEST__: manifest,
  },
});

if (!build.success) {
  for (const log of build.logs) {
    console.error(log);
  }

  throw new Error("SW build failed");
}

const artifact = build.outputs[0];

if (!artifact) {
  throw new Error("SW build produced no output");
}

await Bun.write(join(distDirectory, "sw.js"), await artifact.text());
