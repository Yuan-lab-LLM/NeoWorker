import { GuardrailManager } from "../guardrails/guardrail-manager";
import { loadPolicies } from "../admin/policies";

export interface NetworkPolicyDecision {
  action: "allow" | "deny";
  url: string;
  domain: string;
  toolName: string;
  reason: string;
  ruleSource: "admin_policy" | "legacy_guardrails";
  matchedRule?: string;
}

export interface NetworkPolicyRequest {
  url: string;
  toolName: string;
}

function normalizeDomainPattern(pattern: string): string {
  return String(pattern || "").trim().toLowerCase();
}

function domainMatches(hostname: string, pattern: string): boolean {
  const normalizedPattern = normalizeDomainPattern(pattern);
  if (!hostname || !normalizedPattern) return false;
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === normalizedPattern;
}

export function toLogSafeNetworkPolicyUrl(url: URL): string {
  const safe = new URL(url.toString());
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.toString();
}

export function evaluateNetworkPolicy(request: NetworkPolicyRequest): NetworkPolicyDecision {
  let parsed: URL;
  try {
    parsed = new URL(request.url);
  } catch {
    return {
      action: "deny",
      url: request.url,
      domain: "",
      toolName: request.toolName,
      reason: "invalid_url",
      ruleSource: "admin_policy",
    };
  }

  const domain = parsed.hostname.toLowerCase();
  const logSafeUrl = toLogSafeNetworkPolicyUrl(parsed);
  const policies = loadPolicies();
  const blockedMatch = policies.runtime.network.blockedDomains.find((pattern) =>
    domainMatches(domain, pattern),
  );
  if (blockedMatch) {
    return {
      action: "deny",
      url: logSafeUrl,
      domain,
      toolName: request.toolName,
      reason: "blocked_domain",
      ruleSource: "admin_policy",
      matchedRule: blockedMatch,
    };
  }

  const allowedDomains = policies.runtime.network.allowedDomains;
  if (allowedDomains.length > 0) {
    const allowedMatch = allowedDomains.find((pattern) => domainMatches(domain, pattern));
    if (!allowedMatch) {
      return {
        action: "deny",
        url: logSafeUrl,
        domain,
        toolName: request.toolName,
        reason: "domain_not_in_admin_allowlist",
        ruleSource: "admin_policy",
      };
    }
    return {
      action: "allow",
      url: logSafeUrl,
      domain,
      toolName: request.toolName,
      reason: "admin_allowlist_match",
      ruleSource: "admin_policy",
      matchedRule: allowedMatch,
    };
  }

  if (policies.runtime.network.defaultAction === "deny") {
    return {
      action: "deny",
      url: logSafeUrl,
      domain,
      toolName: request.toolName,
      reason: "admin_default_deny",
      ruleSource: "admin_policy",
    };
  }

  if (!GuardrailManager.isDomainAllowed(parsed.toString())) {
    return {
      action: "deny",
      url: logSafeUrl,
      domain,
      toolName: request.toolName,
      reason: "legacy_guardrail_domain_denied",
      ruleSource: "legacy_guardrails",
    };
  }

  return {
    action: "allow",
    url: logSafeUrl,
    domain,
    toolName: request.toolName,
    reason: "allowed",
    ruleSource: "admin_policy",
  };
}

export function assertNetworkPolicyAllowed(request: NetworkPolicyRequest): NetworkPolicyDecision {
  const decision = evaluateNetworkPolicy(request);
  if (decision.action === "allow") {
    return decision;
  }
  throw new Error(`Network access denied for "${request.url}": ${decision.reason}`);
}
