import { z } from 'zod';

// ============================================================================
// Parameter Constraint schemas
// ============================================================================

export const parameterConstraintSchema = z.object({
  in: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  notIn: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
  pattern: z.string().optional(),
  startsWith: z.string().optional(),
});

export const parameterConstraintsSchema = z.record(z.string(), parameterConstraintSchema);

// ============================================================================
// Policy Rule schemas
// ============================================================================

export const policyRuleSchema = z.object({
  effect: z.enum(['ALLOW', 'DENY']),
  action: z.string().nullable(), // null = wildcard
  parameterConstraints: parameterConstraintsSchema.optional(),
  description: z.string().optional(),
});

export const policyRulesArraySchema = z.array(policyRuleSchema);

// ============================================================================
// API request schemas
// ============================================================================

export const evaluatePolicySchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  providerId: z.string().min(1, 'providerId is required'),
  action: z.string().min(1, 'action is required'),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
});

// ============================================================================
// Inferred types
// ============================================================================

export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyRulesArray = z.infer<typeof policyRulesArraySchema>;
export type EvaluatePolicyInput = z.infer<typeof evaluatePolicySchema>;
