// S4 analogue: pattern scan for secrets accidentally shipped in a plugin — private
// key blocks, cloud/PAT credential ids, and hardcoded credential assignments.
// Ported from skillsmith; applied to every file a plugin ships (validate.ts's job
// there was per-script/body/reference — here it's the whole tree, since objectcore
// plugins ship more component kinds than a bare skill folder).

export interface SecurityFinding {
  level: "error" | "warning";
  message: string;
}

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "private key block", pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub fine-grained PAT", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9-]{20,}\b/ },
  {
    name: "hardcoded credential assignment",
    pattern: /\b(password|api[_-]?key|secret)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
  },
];

/** Scan raw text for shipped secrets. `ctx` is a path/label for the message. */
export function scanSecrets(text: string, ctx: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const p of SECRET_PATTERNS) {
    if (p.pattern.test(text)) {
      findings.push({ level: "error", message: `${ctx}: possible ${p.name} found — remove and rotate it` });
    }
  }
  return findings;
}
