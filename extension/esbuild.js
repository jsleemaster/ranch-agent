const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const watch = process.argv.includes("--watch");

function copyDirIfExists(from, to) {
  if (!fs.existsSync(from)) {
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

function syncRuntimeAssets() {
  const root = process.cwd();
  copyDirIfExists(path.join(root, "..", "webview-ui", "dist"), path.join(root, "webview-ui", "dist"));
  copyDirIfExists(path.join(root, "..", "assets", "placeholder-pack"), path.join(root, "assets", "placeholder-pack"));
  copyDirIfExists(path.join(root, "..", "assets", "user-pack"), path.join(root, "assets", "user-pack"));
  copyDirIfExists(path.join(root, "..", "config"), path.join(root, "config"));
}

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    sourcemap: true,
    outfile: "dist/extension.js",
    external: ["vscode"]
  });

  if (watch) {
    syncRuntimeAssets();
    await ctx.watch();
    console.log("watching extension build...");
    return;
  }

  syncRuntimeAssets();
  await ctx.rebuild();
  await ctx.dispose();
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
