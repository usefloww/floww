/**
 * Policy Rule Chain Evaluator
 *
 * Evaluates an ordered list of rules against an action and its parameters.
 * Used both server-side (dry-run evaluation) and in the SDK runtime (enforcement).
 *
 * Rules are evaluated top-to-bottom, first match wins.
 * If no rule matches, the action is ALLOWED (backward compatible).
 */

import type {
  PolicyRuleWithSource,
  PolicyRuleChain,
  PolicyEvaluationResult,
  ParameterConstraint,
} from './types';

/**
 * Check if a rule's action matches the given action name.
 * A null action is a wildcard that matches any action.
 */
function ruleMatchesAction(rule: PolicyRuleWithSource, action: string): boolean {
  if (rule.action === null) return true;
  return rule.action === action;
}

/**
 * Check if a single parameter constraint is satisfied by a value.
 */
function checkConstraint(constraint: ParameterConstraint, value: unknown): boolean {
  if (constraint.in !== undefined) {
    if (!constraint.in.includes(value as string | number | boolean)) return false;
  }
  if (constraint.notIn !== undefined) {
    if (constraint.notIn.includes(value as string | number | boolean)) return false;
  }
  if (constraint.eq !== undefined) {
    if (value !== constraint.eq) return false;
  }
  if (constraint.pattern !== undefined) {
    if (!new RegExp(constraint.pattern).test(String(value))) return false;
  }
  if (constraint.startsWith !== undefined) {
    if (!String(value).startsWith(constraint.startsWith)) return false;
  }
  return true;
}

/**
 * Check if a rule's parameter constraints are satisfied by the given parameters.
 * If a constrained parameter is missing from the call, the rule does not match.
 */
function ruleMatchesParams(
  rule: PolicyRuleWithSource,
  parameters: Record<string, unknown>
): boolean {
  if (!rule.parameterConstraints) return true;

  for (const [paramName, constraint] of Object.entries(rule.parameterConstraints)) {
    const value = parameters[paramName];
    if (value === undefined) return false; // Required param missing = no match
    if (!checkConstraint(constraint, value)) return false;
  }
  return true;
}

/**
 * Evaluate a rule chain against an action and parameters.
 *
 * Rules are evaluated in order. The first rule that matches both the action
 * and parameters determines the outcome. If no rule matches, the action is ALLOWED.
 */
export function evaluateRuleChain(
  chain: PolicyRuleChain,
  action: string,
  parameters: Record<string, unknown> = {}
): PolicyEvaluationResult {
  for (const rule of chain.rules) {
    if (ruleMatchesAction(rule, action) && ruleMatchesParams(rule, parameters)) {
      const decision = rule.effect === 'ALLOW' ? 'ALLOWED' : 'DENIED';
      const actionDesc = rule.action === null ? '*' : rule.action;
      const reason = rule.description ?? `${rule.effect} ${actionDesc} (${rule.source})`;
      return { decision, matchedRule: rule, reason };
    }
  }

  // No rule matched - implicit ALLOW (backward compatible)
  return {
    decision: 'ALLOWED',
    reason: 'No matching rule (implicit allow)',
  };
}
