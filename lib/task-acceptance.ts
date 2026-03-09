import type { Task } from "./task-types";

const ACCEPTANCE_HEADER_REGEX = /【验收标准】|验收标准[:：]?/;

function cleanCriterion(raw: string): string {
  return raw
    .replace(/^[\s\-*•]+/, "")
    .replace(/^\d+[\.\)、]\s*/, "")
    .trim();
}

function findAcceptanceBlock(description: string): string {
  const normalized = description.replace(/\r/g, "");
  const match = normalized.match(ACCEPTANCE_HEADER_REGEX);
  if (!match || match.index === undefined) {
    return "";
  }

  const block = normalized.slice(match.index + match[0].length).trim();
  const nextSectionMatch = block.match(/\n【[^】]+】/);
  return (nextSectionMatch ? block.slice(0, nextSectionMatch.index) : block).trim();
}

export function extractAcceptanceCriteria(task: Pick<Task, "description" | "acceptanceCriteria">): string[] {
  if (typeof task.acceptanceCriteria === "string" && task.acceptanceCriteria.trim()) {
    return task.acceptanceCriteria
      .split(/\r?\n/)
      .map(cleanCriterion)
      .filter(Boolean);
  }

  const description = typeof task.description === "string" ? task.description : "";
  if (!description.trim()) {
    return [];
  }

  const acceptanceBlock = findAcceptanceBlock(description);
  if (!acceptanceBlock) {
    return [];
  }

  const lines = acceptanceBlock
    .split(/\r?\n/)
    .map(cleanCriterion)
    .filter(Boolean);

  if (lines.length <= 1) {
    return acceptanceBlock
      .split(/[；;。]/)
      .map(cleanCriterion)
      .filter(Boolean);
  }

  return lines;
}
