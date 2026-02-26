import { describe, expect, it } from "vitest";

import { parseWebviewMessage } from "../protocolGuards";

describe("parseWebviewMessage", () => {
  it("accepts valid select_skill", () => {
    const parsed = parseWebviewMessage({ type: "select_skill", skill: "bash" });
    expect(parsed).toEqual({ type: "select_skill", skill: "bash" });
  });

  it("rejects invalid select_skill payload", () => {
    const parsed = parseWebviewMessage({ type: "select_skill", skill: "invalid" });
    expect(parsed).toBeNull();
  });

  it("rejects missing fields", () => {
    expect(parseWebviewMessage({ type: "select_agent" })).toBeNull();
    expect(parseWebviewMessage({})).toBeNull();
  });
});
