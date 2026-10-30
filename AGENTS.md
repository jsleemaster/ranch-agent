# AGENTS.md

This file is the shared contract for Codex, Claude Code, and other coding agents working in this repository. `AGENT.md` is the long-form product and usage guide; read the section that matches your task.

## Project

Ranch-Agent is an emoji-first VS Code extension that visualizes multi-agent runtime activity (agent, skill, folder zone) as a ranch dashboard. It reads Claude Code JSONL session logs and workspace `.claude/agents/*.md` files.

- `extension/`: VS Code extension host (watcher, domain, message bridge)
- `webview-ui/`: React webview UI and canvas rendering
- `shared/`: runtime, domain, and protocol types shared by both sides
- `config/.agent-teams.json`: team, icon, and color mapping

## Commands

```bash
npm --prefix webview-ui install
npm --prefix extension install
npm run build
npm run dev:main-vscode   # rebuild into the main VS Code install
npm run sync:installed
```

## Verification

Run all of these before committing or opening a pull request (from `CONTRIBUTING.md`):

```bash
npm run build
npm --prefix extension run test
npm --prefix extension run typecheck
npm --prefix webview-ui run typecheck
```

## Rules

- Keep existing setting keys and internal IDs (`expeditionSituationRoom.*`) for compatibility.
- Change protocol and domain types in `shared/` once and consume them from both sides.
- Update `README.md`, `AGENT.md`, or `docs/` when behavior changes. Use English for OSS-facing documentation and keep the terms `agent`, `skill`, `zone`, and `gate` consistent.
- Attach a screenshot or GIF for UI-visible changes.
