<p align="center">
  <img src="assets/placeholder-pack/logo.png" alt="Ranch-Agent Logo" width="120" />
</p>

<h1 align="center">Ranch-Agent</h1>

<p align="center">
  <strong>Emoji-first VS Code extension for visualizing multi-agent runtime activity as a ranch dashboard.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#installation">Installation</a> &middot;
  <a href="#configuration">Configuration</a> &middot;
  <a href="#contributing">Contributing</a> &middot;
  <a href="#license">License</a>
</p>

---

## Overview

**Ranch-Agent** turns your multi-agent coding sessions into a live ranch dashboard inside VS Code. It watches Claude JSONL runtime logs in real time and renders agent activity across four intuitive panels — so you always know *who* is doing *what*, *where*, and *when*.

Whether you're orchestrating a single Claude agent or coordinating a fleet of sub-agents, Ranch-Agent gives you instant observability without leaving your editor.

## Features

- **4-Panel Live Dashboard** — Monitor agents, workflows, zones, and event logs at a glance
- **Real-time JSONL Watching** — Auto-discovers Claude session logs or accepts manual paths
- **Multi-Session Support** — Observe multiple concurrent agent sessions simultaneously
- **Agent-MD Tracking** — Auto-detects `.claude/agents/*.md` definitions and tracks invocation counts
- **Event-Driven State Derivation** — Skill normalization, hook gate status, zone mapping, and growth stages
- **Main Branch Protection** — Visual warnings when agents operate on protected branches
- **Emoji-First Rendering** — Customizable asset packs with user-override support
- **Unmapped Skill Debug Logging** — Local NDJSON logs for rapid skill-mapping improvements

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- VS Code 1.90+

### 1. Clone & Install

```bash
git clone https://github.com/jsleemaster/ranch-agent.git
cd ranch-agent
npm --prefix webview-ui install
npm --prefix extension install
```

### 2. Build

```bash
npm run build
```

### 3. Launch

1. Open this repo in VS Code
2. Go to **Run and Debug** → select **Run Ranch-Agent**
3. In the Extension Development Host window:
   - Open Command Palette → `Ranch-Agent: Focus Ranch`
   - The `RANCH-AGENT` tab appears in the bottom panel

## Installation

### Install via VSIX (Recommended for daily use)

```bash
npm run build
cd extension
npx @vscode/vsce package
```

Then in VS Code: **Extensions** → `...` → **Install from VSIX...** → select the generated `.vsix` file.

### Live Development Mode

Keep your local installation in sync during development:

```bash
npm run dev:main-vscode
```

This watches both `webview-ui` and `extension` for changes and auto-syncs to your VS Code extensions directory.

## Dashboard Panels

| Panel | Description |
|-------|-------------|
| **Worker Pen** (일꾼 우리) | Agent status, roles, current skills, growth stage, and branch risk indicators |
| **Work Flow** (작업 동선) | `agent → skill → gate` pipeline view showing each agent's current work path |
| **Ranch Zones** (목장 구역) | File-path-based zone map showing where agents are concentrated |
| **Activity Log** (작업 일지) | Chronological event timeline (up to 200 events) for full session traceability |

## Configuration

All settings use the `expeditionSituationRoom.*` namespace in VS Code Settings for backward compatibility.

### Runtime Input

**Auto mode** (default): Watches `~/.claude/projects/<workspace>/` for `.jsonl` files.

**Manual mode**: Set a specific path in VS Code Settings:

```json
{
  "expeditionSituationRoom.runtimeJsonlPath": "/path/to/session.jsonl"
}
```

### Main Branch Detection

```json
{
  "expeditionSituationRoom.mainBranchDetect.enabled": true,
  "expeditionSituationRoom.mainBranchDetect.mainBranchNames": ["main", "master", "trunk"]
}
```

### Debug Logging

```json
{
  "expeditionSituationRoom.debug.unmappedSkillLog.enabled": true,
  "expeditionSituationRoom.debug.unmappedSkillLog.filePath": ".local-debug/unmapped-skill-events.ndjson"
}
```

## Project Structure

```
ranch-agent/
├── extension/       # VS Code extension host (watcher, domain, message bridge)
├── webview-ui/      # React webview UI + canvas rendering
├── shared/          # Runtime/domain/protocol shared types
├── assets/          # Placeholder & user asset packs
├── config/          # Team/icon/color mapping rules
├── docs/            # Runtime timing metrics & debugging guides
├── scripts/         # Build & sync automation scripts
└── AGENT.md         # Detailed agent operation guide (한국어)
```

## Development

```bash
# Full build
npm run build

# Extension tests & type checking
npm --prefix extension run test
npm --prefix extension run typecheck

# Webview type checking
npm --prefix webview-ui run typecheck
```

## Roadmap

- [ ] Multi-runtime adapters (Codex, etc.)
- [ ] Richer animation + sprite packs
- [ ] Map layout presets
- [ ] Release pipeline automation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Credits

Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents) and its real-time multi-agent visualization architecture.

## License

This project is currently unlicensed. A license will be determined before public distribution. Please check back for updates.

---

<p align="center">
  Made with ranch spirit by <a href="https://github.com/jsleemaster">@jsleemaster</a>
</p>
