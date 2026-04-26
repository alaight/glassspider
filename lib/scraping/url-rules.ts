import type { SourceRule } from "@/lib/types";

export function normaliseUrl(href: string, baseUrl: string) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function matchesRule(url: string, rule: SourceRule) {
  try {
    return new RegExp(rule.pattern).test(url);
  } catch {
    return url.includes(rule.pattern);
  }
}

export function shouldVisitUrl(url: string, rules: SourceRule[]) {
  const activeRules = rules.filter((rule) => rule.is_active);
  const excludes = activeRules.filter((rule) => rule.rule_type === "exclude");
  const includes = activeRules.filter((rule) => rule.rule_type === "include");

  if (excludes.some((rule) => matchesRule(url, rule))) {
    return false;
  }

  if (includes.length === 0) {
    return true;
  }

  return includes.some((rule) => matchesRule(url, rule));
}

export function classifyUrl(url: string, rules: SourceRule[]) {
  const activeRules = rules.filter((rule) => rule.is_active);

  if (activeRules.some((rule) => rule.rule_type === "detail" && matchesRule(url, rule))) {
    return "detail" as const;
  }

  if (activeRules.some((rule) => rule.rule_type === "listing" && matchesRule(url, rule))) {
    return "listing" as const;
  }

  if (/award|awarded|contract/i.test(url)) {
    return "award" as const;
  }

  if (/\.pdf($|\?)/i.test(url)) {
    return "document" as const;
  }

  return "unknown" as const;
}

export function matchedRuleLabel(url: string, rules: SourceRule[]) {
  const rule = rules
    .filter((candidate) => candidate.is_active)
    .sort((a, b) => a.priority - b.priority)
    .find((candidate) => matchesRule(url, candidate));

  return rule ? `${rule.rule_type}:${rule.pattern}` : null;
}
