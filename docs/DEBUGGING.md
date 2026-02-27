# Debugging Guide

## 목적

`기타(other)`로 분류되는 스킬 이벤트를 로컬에서 수집해 매핑 룰을 개선합니다.

## 로그 활성화

VS Code Settings (`settings.json`)에 아래를 추가합니다.

```json
{
  "expeditionSituationRoom.debug.unmappedSkillLog.enabled": true,
  "expeditionSituationRoom.debug.unmappedSkillLog.filePath": ".local-debug/unmapped-skill-events.ndjson"
}
```

- 경로가 상대 경로면 workspace root 기준으로 해석됩니다.
- 로그는 NDJSON(한 줄당 JSON 1개) 형식입니다.

## 저장 위치/공개 정책

- 기본 경로: `.local-debug/unmapped-skill-events.ndjson`
- `.local-debug/`는 `.gitignore`에 포함되어 있어 원격 저장소에 커밋되지 않습니다.

## 레코드 필드

- `ts`, `isoTime`
- `agentRuntimeId`
- `eventType`
- `toolName`
- `mappedSkill`
- `reason`
- `detail`
- `invokedAgentHint`, `invokedSkillHint`
- `invokedAgentMdId`, `invokedSkillMdId`

`reason` 값:
- `unknown_tool_name`: tool 이름이 있지만 현재 매핑 테이블에 없음
- `assistant_without_tool_name`: assistant_text 이벤트인데 toolName 없음
- `missing_tool_name`: tool_start/tool_done인데 toolName 없음

## 빠른 분석 예시

```bash
jq -r '.reason + "\t" + (.toolName // "-")' .local-debug/unmapped-skill-events.ndjson \
  | sort | uniq -c | sort -nr | head -n 30
```

```bash
jq -r 'select(.reason=="unknown_tool_name") | .toolName' .local-debug/unmapped-skill-events.ndjson \
  | sort | uniq -c | sort -nr | head -n 30
```

## 개선 워크플로

1. 로그를 수집합니다.
2. `unknown_tool_name` 상위 항목을 확인합니다.
3. `extension/src/domain/skillNormalizer.ts`에 매핑을 추가합니다.
4. 테스트 후 로그를 다시 확인해 `other` 비중이 줄었는지 검증합니다.

