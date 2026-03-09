#!/usr/bin/env node

const http = require("node:http");
const https = require("node:https");

function parseArgs(argv) {
  const result = {
    url: "",
    token: ""
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

async function main() {
  const { url, token } = parseArgs(process.argv);
  if (!url) {
    return;
  }

  const raw = await readStdin();
  if (!raw) {
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

main()
  .catch(() => undefined)
  .finally(() => {
    process.stdout.write("");
  });
