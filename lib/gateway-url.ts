/**
 * Build a gateway URL.
 * - Prefer explicit host override from backend config when provided.
 * - Fallback to current browser hostname for LAN access.
 * - SSR fallback: localhost.
 */
export function buildGatewayUrl(
  port: number,
  path: string,
  params?: Record<string, string>,
  hostOverride?: string,
): string {
  const host = (hostOverride && hostOverride.trim()) || (typeof window !== "undefined" ? window.location.hostname : "localhost");
  const normalizedHost = host.includes("://") ? new URL(host).hostname : host;
  const url = new URL(`http://${normalizedHost}:${port}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  return url.toString();
}
