import type { WebviewToExtMessage } from "../../shared/protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseWebviewMessage(value: unknown): WebviewToExtMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  if (value.type === "webview_ready") {
    return { type: "webview_ready" };
  }

  return null;
}
