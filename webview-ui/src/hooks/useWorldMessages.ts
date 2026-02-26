import { useEffect } from "react";

import type { ExtToWebviewMessage } from "@shared/protocol";
import { vscode } from "../vscodeApi";
import type { WorldState } from "../world/WorldState";

function isMessage(value: unknown): value is ExtToWebviewMessage {
  return !!value && typeof value === "object" && "type" in (value as Record<string, unknown>);
}

export function useWorldMessages(world: WorldState): void {
  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      if (!isMessage(event.data)) {
        return;
      }
      world.applyMessage(event.data);
    };

    window.addEventListener("message", handler);
    vscode.postMessage({ type: "webview_ready" });

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [world]);
}
