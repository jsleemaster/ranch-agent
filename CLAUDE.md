# Claude Code

@AGENTS.md

# Claude Code Mapping

- `AGENTS.md` is the shared rule source for Codex and Claude Code. Change project rules there; keep this file to Claude-specific differences.
- Sessions target Opus 5.5 (`claude-opus-5-5`) at the default effort. Apply each rule as written and keep changes inside the requested scope.
- This extension parses Claude Code session JSONL. When the Claude Code log format changes, confirm it against a real local session before changing the watcher, and do not read or quote user session content beyond what the task needs.
