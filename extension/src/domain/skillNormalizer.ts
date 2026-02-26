import type { SkillKind } from "../../../shared/domain";

function lower(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeSkill(toolName: string | undefined): SkillKind | null {
  const name = lower(toolName);
  if (!name) {
    return null;
  }

  if (name === "read") {
    return "read";
  }

  if (name === "edit" || name === "multiedit") {
    return "edit";
  }

  if (name === "write") {
    return "write";
  }

  if (name === "bash" || name === "terminal") {
    return "bash";
  }

  if (["glob", "grep", "websearch", "webfetch", "search", "search_query", "find"].includes(name)) {
    return "search";
  }

  if (name === "task") {
    return "task";
  }

  if (name === "askuserquestion" || name === "ask" || name === "question") {
    return "ask";
  }

  return "other";
}
