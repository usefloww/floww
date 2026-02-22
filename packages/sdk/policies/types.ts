/**
 * Policy System Types
 *
 * Shared type definitions for the firewall-style policy rule system.
 * Used by both the server (rule management, chain building) and the SDK runtime (enforcement).
 */

export type PolicyEffect = 'ALLOW' | 'DENY';

export type ParameterConstraint = {
  in?: (string | number | boolean)[];
  notIn?: (string | number | boolean)[];
  eq?: string | number | boolean;
  pattern?: string;
  startsWith?: string;
};

export type ParameterConstraints = {
  [paramName: string]: ParameterConstraint;
};

export type PolicyRule = {
  effect: PolicyEffect;
  action: string | null; // null = wildcard (matches any action)
  parameterConstraints?: ParameterConstraints;
  description?: string;
};

export type PolicyRuleWithSource = PolicyRule & {
  source: 'grant' | 'default';
};

/**
 * A complete rule chain for a single provider, ready for evaluation.
 * Grant rules come first, followed by provider default rules.
 */
export type PolicyRuleChain = {
  rules: PolicyRuleWithSource[];
};

/**
 * Result of evaluating a rule chain against an action.
 */
export type PolicyEvaluationResult = {
  decision: 'ALLOWED' | 'DENIED';
  matchedRule?: PolicyRuleWithSource;
  reason: string;
};
