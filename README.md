# Ranch-Agent

Emoji-first VS Code extension for visualizing multi-agent runtime activity as a live ranch dashboard.

## Overview

Ranch-Agent watches Claude JSONL runtime logs and renders agent activity across four panels so you can quickly understand who is doing what, where, and when during coding sessions.

It is built as a monorepo with:

- `extension/` for the VS Code extension host logic
- `webview-ui/` for the React-based panel UI
- `shared/` for shared runtime and protocol types

## Features

- 4-panel live dashboard for workers, flow, zones, and activity
- Automatic JSONL discovery plus manual runtime file path override
- Multi-session observation support
- Workspace `.claude/agents/*.md` detection and invocation tracking
- Event-derived skill normalization, gate status, and zone mapping
- Main-branch risk highlighting (`main`/`master`/`trunk`)
- Asset-pack override strategy (`user-pack` -> `placeholder-pack` -> emoji)
- Optional local unmapped-skill NDJSON debug logging

## Installation

### Development install

Prerequisites:

- Node.js 18+
- npm 9+
- VS Code 1.90+

```bash
npm --prefix webview-ui install
npm --prefix extension install
npm run build
```

### VSIX install

```bash
npm run build
cd extension
npx @vscode/vsce package
```

Then open VS Code:

1. Extensions panel
2. `...` menu
3. `Install from VSIX...`
4. Select the generated `.vsix` file

## Quick Start

1. Open this repository in VS Code.
2. Go to Run and Debug and launch `Run Ranch-Agent`.
3. In the Extension Development Host, run `Ranch-Agent: Focus Ranch` from Command Palette.
4. Confirm the `RANCH-AGENT` panel appears at the bottom.

For a local "always synced" development loop in your main VS Code install:

```bash
npm run dev:main-vscode
```

## Configuration

All settings use the `expeditionSituationRoom.*` namespace for compatibility.

### Runtime input

Auto mode (default): watches `~/.claude/projects/<workspace>/` for `.jsonl` files.

Manual mode:

```json
{
  "expeditionSituationRoom.runtimeJsonlPath": "/absolute/path/to/session.jsonl"
}
```

### Main branch detection

```json
{
  "expeditionSituationRoom.mainBranchDetect.enabled": true,
  "expeditionSituationRoom.mainBranchDetect.mainBranchNames": ["main", "master", "trunk"],
  "expeditionSituationRoom.mainBranchDetect.excludeAgentIdPattern": "^(my-agent-id|coordinator)$"
}
```

### Unmapped skill debug logging

```json
{
  "expeditionSituationRoom.debug.unmappedSkillLog.enabled": true,
  "expeditionSituationRoom.debug.unmappedSkillLog.filePath": ".local-debug/unmapped-skill-events.ndjson"
}
```

## Development

```bash
# Full build
npm run build

# Extension checks
npm --prefix extension run test
npm --prefix extension run typecheck

# Webview checks
npm --prefix webview-ui run typecheck
```

Detailed internal and operational guide:
[AGENT.md](./AGENT.md)

## Support

Use [GitHub Issues](https://github.com/jsleemaster/ranch-agent/issues) for bug reports, usage questions, and feature requests.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Security

For vulnerability reporting policy and private disclosure process, see [SECURITY.md](./SECURITY.md).

## Code of Conduct

This project follows [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md).

## License

This project is licensed under the [MIT License](./LICENSE).
