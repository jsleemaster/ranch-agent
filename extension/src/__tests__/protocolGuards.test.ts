import { describe, expect, it } from "vitest";

import { parseWebviewMessage } from "../protocolGuards";

describe("parseWebviewMessage", () => {
  it("accepts webview_ready", () => {
    const parsed = parseWebviewMessage({ type: "webview_ready" });
    expect(parsed).toEqual({ type: "webview_ready" });
  });

  it("rejects removed filter messages", () => {
    const parsed = parseWebviewMessage({ type: "select_skill", skill: "bash" });
    expect(parsed).toBeNull();
  });

  it("rejects missing fields", () => {
    expect(parseWebviewMessage({ type: "select_agent", agentId: "a" })).toBeNull();
    expect(parseWebviewMessage({})).toBeNull();
  });
});
