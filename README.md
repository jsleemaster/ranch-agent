# Ranch-Agent

Emoji-first VS Code extension for visualizing multi-agent runtime activity as a ranch dashboard.

`누가(agent)`, `무엇을(skill)`, `어디서(folder zone)` 작업 중인지 4개 패널로 실시간 표시합니다.

## What You Get

- 4-panel live visualization:
  - `일꾼 우리` (agent board)
  - `작업 동선` (agent -> skill -> gate flow)
  - `목장 구역` (folder zone map)
  - `작업 일지` (live event feed)
- Claude JSONL 실시간 감시 (자동 탐색 + 수동 경로 설정)
- Multi-JSONL 입력 지원 (동시 세션 관찰)
- 이벤트 기반 상태 파생:
  - skill 정규화
  - hook gate 상태(open/blocked/failed/closed)
  - zone 매핑
  - growth stage(seed/sprout/grow/harvest)
- Emoji-first 렌더 + user-pack 에셋 덮어쓰기

## Demo Concept

- 기본 컨셉: `Ranch-Agent`
- 기존 설정 키/내부 ID(`expeditionSituationRoom.*`)는 호환성 때문에 유지합니다.

## Project Structure

- `extension/`: VS Code extension host (watcher, domain, message bridge)
- `webview-ui/`: React webview UI + canvas rendering
- `shared/`: runtime/domain/protocol shared types
- `assets/`: placeholder/user asset packs
- `config/.agent-teams.json`: 팀/아이콘/색상 매핑 규칙

## Prerequisites

- Node.js 18+
- npm 9+
- VS Code 1.90+

## Quick Start (5 minutes)

### 1) Install dependencies

```bash
npm --prefix webview-ui install
npm --prefix extension install
```

### 2) Build

```bash
npm run build
```

### 3) Run in Extension Development Host

1. VS Code에서 이 레포를 엽니다.
2. `Run and Debug`에서 `Run Ranch-Agent` 또는 `Run Ranch-Agent (Extension Folder)` 실행
3. 새로 뜨는 Extension Development Host에서:
   - Command Palette -> `Ranch-Agent: Focus Ranch`
   - 하단 패널에 `RANCH-AGENT` 탭이 열리면 정상

## Install to Your Main VS Code (VSIX)

개발 호스트가 아닌 평소 VS Code에서 쓰려면 VSIX 설치가 가장 깔끔합니다.

### 1) Build first

```bash
npm run build
```

### 2) Package VSIX

```bash
cd extension
npx @vscode/vsce package
```

생성 예시: `ranch-agent-extension-0.1.0.vsix`

### 3) Install VSIX

- VS Code -> Extensions -> `...` -> `Install from VSIX...`
- 생성된 `.vsix` 선택 후 Reload

## Runtime Input (Claude JSONL)

### Auto mode

설정값이 비어 있으면 아래 폴더의 `.jsonl` 파일들을 자동 탐색해 감시합니다.

```text
~/.claude/projects/<workspace-path-with-slashes-replaced>/
```

여러 파일이 있으면 최근 수정 순으로 정렬해 모두 감시합니다.

### Manual mode

원하는 파일을 고정하려면 VS Code Settings에 아래 값 지정:

```json
{
  "expeditionSituationRoom.runtimeJsonlPath": "/absolute/path/to/session.jsonl"
}
```

## How to Use with Claude

1. Ranch-Agent를 실행 중인 같은 workspace에서 Claude/Codex 에이전트 작업 시작
2. JSONL 이벤트가 생성되면 패널이 실시간 갱신
3. 패널 클릭으로 필터 동기화:
   - agent 선택
   - skill 선택
   - zone 선택

## Asset Strategy

- 기본 렌더 우선순위:
  - `user-pack -> placeholder-pack -> emoji`
- 사용자 에셋 슬롯:
  - `assets/user-pack/manifest.json`
- 팀 매핑:
  - `config/.agent-teams.json`

## Development

```bash
# root
npm run build

# extension only
npm --prefix extension run test
npm --prefix extension run typecheck

# webview only
npm --prefix webview-ui run typecheck
```

## Troubleshooting

- 화면이 비어 있음 (`...`만 보임):
  - 아직 JSONL 이벤트가 안 들어온 상태입니다.
  - Claude 작업을 실제로 한 번 실행해 보세요.
- 설치 후 확장 상세에서 `package.json` 파싱 에러:
  - 예전 로컬 확장 폴더(`local.farm-agent-ranch-extension-*`) 캐시가 남아 있을 수 있습니다.
  - 해당 구버전 제거 후 `Developer: Reload Window` 실행하세요.
- 이름이 예전(`Farm-Agent`)으로 보임:
  - VSIX 재설치 또는 로컬 확장 폴더 갱신 후 Reload 필요

## Roadmap (MVP+)

- 다중 런타임 어댑터(Codex 등) 추가
- richer animation + sprite packs
- map layout presets
- release pipeline automation

## Credits

- Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents) and its real-time multi-agent visualization architecture.

## License

현재 저장소에는 별도 `LICENSE` 파일이 없습니다. 공개 배포 전 라이선스 정책을 확정해 주세요.
