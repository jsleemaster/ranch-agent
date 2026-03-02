# Contributing to Ranch-Agent

Thanks for contributing to Ranch-Agent.

This guide defines the practical baseline for contributing code, docs, and UI changes.

## Before You Start

1. Check existing [Issues](https://github.com/jsleemaster/ranch-agent/issues) for duplicates.
2. Open a new issue for bugs, feature requests, or design discussions when needed.
3. Align on scope before large changes.

## Contribution Flow

1. Fork the repository.
2. Create a branch from `main`.
3. Implement the change with tests/docs as needed.
4. Run local validation commands.
5. Open a pull request to `main`.

Recommended branch naming:

- `feature/<short-description>`
- `fix/<short-description>`
- `docs/<short-description>`

## Local Setup

```bash
npm --prefix webview-ui install
npm --prefix extension install
```

## Required Local Validation

Run all commands below before opening a pull request:

```bash
npm run build
npm --prefix extension run test
npm --prefix extension run typecheck
npm --prefix webview-ui run typecheck
```

## Pull Request Checklist

Use this checklist in every PR description:

- Clear summary of what changed and why
- Reproduction and verification steps
- UI screenshot or GIF for UI-visible changes
- Linked issue(s), if applicable
- Notes about known limitations or follow-up work

## Commit Messages

Conventional Commits are recommended but not required.

Good examples:

- `feat(webview): add zone heat legend`
- `fix(extension): prevent stale runtime session leak`
- `docs: clarify VSIX install flow`

## Documentation Expectations

- Update README and/or docs when behavior changes.
- Keep terminology consistent across docs (`agent`, `skill`, `zone`, `gate`).
- Use English for OSS-facing documentation.

## Security and Conduct

- Do not report vulnerabilities in public issues. Follow [SECURITY.md](./SECURITY.md).
- Be respectful in all project spaces. Follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
