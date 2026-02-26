type VsCodeApi = {
  postMessage: (message: unknown) => void;
  setState: (state: unknown) => void;
  getState: () => unknown;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __FARM_AGENT_ASSETS__?: unknown;
    __EXPEDITION_ASSETS__?: unknown;
  }
}

export const vscode: VsCodeApi =
  typeof window.acquireVsCodeApi === "function"
    ? window.acquireVsCodeApi()
    : {
        postMessage: (message: unknown) => {
          console.info("[webview->extension]", message);
        },
        setState: () => undefined,
        getState: () => undefined
      };
