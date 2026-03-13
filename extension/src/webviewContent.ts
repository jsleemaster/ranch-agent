import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

import type { WebviewAssetCatalog } from "./assetPackLoader";

function nonce(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 24; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function findBuiltAssets(webviewDistDir: string): { scriptPath: string | null; cssPaths: string[] } {
  const assetsDir = path.join(webviewDistDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    return { scriptPath: null, cssPaths: [] };
  }

  const entries = fs.readdirSync(assetsDir);
  const scriptPath = entries.find((entry) => entry.endsWith(".js")) ?? null;
  const cssPaths = entries.filter((entry) => entry.endsWith(".css"));

  return {
    scriptPath: scriptPath ? path.join(assetsDir, scriptPath) : null,
    cssPaths: cssPaths.map((entry) => path.join(assetsDir, entry))
  };
}

function withVersionedQuery(filePath: string, uri: vscode.Uri): string {
  try {
    const stat = fs.statSync(filePath);
    const version = Math.trunc(stat.mtimeMs).toString();
    const separator = uri.toString().includes("?") ? "&" : "?";
    return `${uri.toString()}${separator}v=${version}`;
  } catch {
    return uri.toString();
  }
}

export function buildWebviewHtml(options: {
  webview: vscode.Webview;
  webviewDistDir: string;
  assetCatalog: WebviewAssetCatalog;
}): string {
  const { webview, webviewDistDir, assetCatalog } = options;
  const { scriptPath, cssPaths } = findBuiltAssets(webviewDistDir);
  const scriptNonce = nonce();

  if (!scriptPath) {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: sans-serif; padding: 16px; }
      code { background: #f0f0f0; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h3>Webview bundle not found</h3>
    <p>Build <code>webview-ui</code> first so the control room can render.</p>
  </body>
</html>`;
  }

  const scriptUri = withVersionedQuery(scriptPath, webview.asWebviewUri(vscode.Uri.file(scriptPath)));
  const cssUris = cssPaths.map((cssPath) =>
    withVersionedQuery(cssPath, webview.asWebviewUri(vscode.Uri.file(cssPath)))
  );

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: https:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'nonce-${scriptNonce}'`,
    `font-src ${webview.cspSource}`
  ].join("; ");

  const cssLinks = cssUris.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    ${cssLinks}
    <title>Ranch-Agent Control Room</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${scriptNonce}">
      window.__FARM_AGENT_ASSETS__ = ${JSON.stringify(assetCatalog)};
      window.__EXPEDITION_ASSETS__ = ${JSON.stringify(assetCatalog)};
    </script>
    <script nonce="${scriptNonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}
