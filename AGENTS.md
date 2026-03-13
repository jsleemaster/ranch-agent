# Repository Guidelines

## Project Structure & Module Organization
This repository is a small monorepo for a VS Code extension.

- `extension/`: extension-host runtime, JSONL/HTTP ingestion, domain logic, and Vitest tests in `extension/src/__tests__/`.
- `webview-ui/`: React + Vite webview app (`src/components`, `src/hooks`, `src/world`).
- `shared/`: cross-package protocol and runtime types imported by both extension and UI.
- `assets/` and `config/`: sprite/icon packs and team mapping (`config/.agent-teams.json`).
- `docs/`: operational docs and screenshots; update when behavior or UI changes.
- `scripts/`: local development helpers (sync/install loop for VS Code).

## Build, Test, and Development Commands
Run commands from the repository root unless noted.

- `npm run build`: builds `webview-ui` then `extension`.
- `npm run watch`: watches and rebuilds `webview-ui`.
- `npm --prefix extension run watch`: watches extension build output.
- `npm --prefix extension run test`: runs extension tests (Vitest).
- `npm --prefix extension run typecheck`: TypeScript check for extension.
- `npm --prefix webview-ui run typecheck`: TypeScript check for webview UI.
- `npm run sync:installed`: continuously rsyncs `extension/` into the local installed extension directory.
- `npm run dev:main-vscode`: starts webview watch, extension watch, and installed-extension sync loop together.
- `npm run prepare:rail-assets`: prepares user-pack rail assets from source PNGs (`train_front`, `train_side`, `rail_stage_bg`).

## Coding Style & Naming Conventions
- Language: TypeScript (`.ts` / `.tsx`) with strict type checks.
- Style: 2-space indentation, semicolons, and double-quoted imports/strings (match existing files).
- Naming: `PascalCase` for React components (`AgentBoard.tsx`), `camelCase` for modules/utilities (`runtimeHub.ts`).
- Tests: colocate under `extension/src/__tests__` and use `*.test.ts` suffix.
- There is no repo-wide ESLint/Prettier config; keep diffs minimal and consistent with nearby code.

## Testing Guidelines
- Primary framework is Vitest in `extension/`.
- Add or update tests with any extension runtime/domain behavior change.
- Prefer focused unit tests near changed modules (e.g., parser, resolver, runtime hub).
- Before opening a PR, run:
  - `npm run build`
  - `npm --prefix extension run test`
  - `npm --prefix extension run typecheck`
  - `npm --prefix webview-ui run typecheck`

## Commit & Pull Request Guidelines
- Follow Conventional Commits style used in history: `feat: ...`, `fix(webview): ...`, `docs: ...`.
- Keep commits scoped and descriptive; avoid mixing unrelated changes.
- Branch naming: `feature/<topic>`, `fix/<topic>`, or `docs/<topic>`.
- PRs should include: purpose, verification steps, linked issue(s), and UI screenshot/GIF for visible changes.

## Security & Configuration Tips
- Never commit secrets, local runtime logs, or machine-specific absolute paths.
- Use `expeditionSituationRoom.*` settings for runtime input and debug logging.
- Report vulnerabilities privately per `SECURITY.md` (do not open public security issues).
