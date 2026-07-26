// S2 analogue: detect network-touching calls in a shipped script, ported from
// skillsmith's pattern list. A script matching one of these must be listed in
// policy.networkAllowlist or it errors — a conscious, reviewable decision.

const NETWORK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "curl", pattern: /\bcurl\b/ },
  { name: "wget", pattern: /\bwget\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "axios", pattern: /\baxios\b/ },
  { name: "http.request", pattern: /\bhttps?\.request\s*\(/ },
  { name: "urllib", pattern: /\burllib\b/ },
  { name: "requests.get/post", pattern: /\brequests\.(get|post|put|delete|patch)\s*\(/ },
  { name: "Invoke-WebRequest", pattern: /Invoke-WebRequest|Invoke-RestMethod/i },
];

/** Names of every network pattern found in `text`. */
export function detectNetworkCalls(text: string): string[] {
  return NETWORK_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.name);
}
