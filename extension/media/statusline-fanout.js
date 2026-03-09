#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

function parseArgs(argv) {
  const result = {
    url: "",
    token: "",
    claudeHud: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url" && typeof argv[index + 1] === "string") {
      result.url = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--token" && typeof argv[index + 1] === "string") {
      result.token = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--claude-hud") {
      result.claudeHud = true;
    }
  }

  return result;
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8").trim());
    });
    process.stdin.on("error", () => resolve(""));
  });
}

async function postToRanch(url, token, raw) {
  if (!url || !raw) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return;
  }

  const client = parsedUrl.protocol === "https:" ? https : http;
  await new Promise((resolve) => {
    const request = client.request(
      parsedUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(raw),
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        timeout: 350
      },
      (response) => {
        response.resume();
        response.on("end", resolve);
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(undefined);
    });
    request.on("error", () => resolve(undefined));
    request.end(raw);
  });
}

function findLatestClaudeHudScript() {
  try {
    const baseDir = path.join(os.homedir(), ".claude", "plugins", "cache", "claude-hud", "claude-hud");
    const versions = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        fullPath: path.join(baseDir, entry.name)
      }))
      .sort((a, b) => {
        const aStat = fs.statSync(a.fullPath);
        const bStat = fs.statSync(b.fullPath);
        return bStat.mtimeMs - aStat.mtimeMs;
      });

    for (const version of versions) {
      const candidate = path.join(version.fullPath, "dist", "index.js");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function renderClaudeHud(raw) {
  return new Promise((resolve) => {
    const hudScript = findLatestClaudeHudScript();
    if (!hudScript || !raw) {
      resolve("");
      return;
    }

    const child = spawn(process.execPath, [hudScript], {
      stdio: ["pipe", "pipe", "ignore"]
    });

    const chunks = [];
    child.stdout.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", () => resolve(""));
    child.on("close", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    child.stdin.end(raw);
  });
}

async function main() {
  const { url, token, claudeHud } = parseArgs(process.argv);
  const raw = await readStdin();
  if (!raw) {
    return;
  }

  const hudPromise = claudeHud ? renderClaudeHud(raw) : Promise.resolve("");
  await postToRanch(url, token, raw);
  const hudOutput = await hudPromise;
  process.stdout.write(hudOutput || "");
}

main()
  .catch(() => undefined)
  .finally(() => {
    process.stdout.end();
  });
