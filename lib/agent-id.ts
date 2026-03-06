import { getSystemConfig } from "./system-config";

const LEGACY_AGENT_ID_ALIASES: Record<string, string> = {
  boss: "niuma-boss",
  searcher: "niuma-searcher",
  osadmin: "niuma-osadmin",
  coder: "niuma-coder",
  docmanager: "niuma-docmanager",
};

/**
 * Normalize legacy/short agent IDs (e.g. "docmanager") to configured IDs
 * (e.g. "niuma-docmanager"). Returns undefined for empty input.
 */
export function normalizeAgentId(agentId?: string | null): string | undefined {
  if (typeof agentId !== "string") return undefined;

  const raw = agentId.trim();
  if (!raw) return undefined;

  const cfg = getSystemConfig();
  const availableAgents = cfg.availableAgents || [];
  if (availableAgents.includes(raw)) return raw;

  const lower = raw.toLowerCase();
  const byAlias = LEGACY_AGENT_ID_ALIASES[lower];
  if (byAlias) {
    if (availableAgents.length === 0 || availableAgents.includes(byAlias)) {
      return byAlias;
    }
  }

  const niumaPrefixed = lower.startsWith("niuma-") ? lower : `niuma-${lower}`;
  const exactNiuma = availableAgents.find((id) => id.toLowerCase() === niumaPrefixed);
  if (exactNiuma) return exactNiuma;

  const suffixMatches = availableAgents.filter((id) =>
    id.toLowerCase().endsWith(`-${lower}`)
  );
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  return raw;
}

