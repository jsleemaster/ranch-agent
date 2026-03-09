export const EXTENSION_ID = "expeditionSituationRoom";
export const VIEW_TYPE = "expeditionSituationRoom.view";
export const CONFIG_SECTION = "expeditionSituationRoom";

export const FEED_LIMIT = 200;
export const INTERNAL_EVENT_LIMIT = 1000;
export const MESSAGE_QUEUE_LIMIT = 1000;

export const WATCHER_POLL_MS = 300;
export const WATCHER_RETRY_MS = 2000;
export const AUTO_RUNTIME_SCAN_MS = 5000;
export const IDLE_WAIT_MS = 30000;
export const MESSAGE_FLUSH_MS = 40;
export const WORLD_REFRESH_MS = 5000;
export const MAX_POLLED_SOURCES_PER_TICK = 16;
export const MAX_WATCH_JSONL_FILES = 48;
export const AUTO_SCAN_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
export const HTTP_HOOK_DEFAULT_BIND = "127.0.0.1";
export const HTTP_HOOK_DEFAULT_PORT = 48216;
export const HTTP_HOOK_DEFAULT_PATH = "/ranch-hook";
export const HTTP_HOOK_MAX_BODY_BYTES = 256 * 1024;
export const HTTP_HOOK_QUEUE_LIMIT = 1000;
export const HTTP_HOOK_DEDUPE_WINDOW_MS = 1500;
export const HTTP_HOOK_JSONL_PRIMARY_HTTP_HOLD_MS = 250;
export const HTTP_HOOK_DETAIL_MAX_CHARS = 1200;
export const HTTP_HOOK_DRAIN_BATCH = 64;

export const STATUSLINE_DEFAULT_BIND = "127.0.0.1";
export const STATUSLINE_DEFAULT_PORT = 48217;
export const STATUSLINE_DEFAULT_PATH = "/ranch-statusline";
export const STATUSLINE_MAX_BODY_BYTES = 256 * 1024;
export const STATUSLINE_QUEUE_LIMIT = 512;
export const STATUSLINE_DRAIN_BATCH = 64;
export const STATUSLINE_USAGE_CACHE_MS = 60 * 1000;
export const STATUSLINE_USAGE_TIMEOUT_MS = 2_000;

export const DEFAULT_ZONE_ORDER = ["src", "apps", "packages", "infra", "scripts", "docs", "tests", "etc"];
