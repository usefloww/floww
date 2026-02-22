/**
 * Policy Rules Routes
 *
 * GET  /api/provider-access/:grantId/rules       Get grant rules
 * PUT  /api/provider-access/:grantId/rules       Replace grant rules
 * GET  /api/providers/:providerId/default-rules   Get provider default rules
 * PUT  /api/providers/:providerId/default-rules   Replace provider default rules
 * POST /api/policies/evaluate                     Dry-run evaluation
 */

import { get, put, post, json, errorResponse, parseBody } from '~/server/api/router';
import { policyRulesArraySchema, evaluatePolicySchema } from '~/server/api/schemas';
import * as policyService from '~/server/services/policy-service';
import * as providerService from '~/server/services/provider-service';
import { hasWorkflowAccess } from '~/server/services/access-service';

// ============================================================================
// Grant Rules
// ============================================================================

// Get grant rules
get('/provider-access/:grantId/rules', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const rules = await policyService.getGrantRules(params.grantId);
  if (rules === null) {
    return errorResponse('Grant not found', 404);
  }

  return json({ rules });
});

// Replace grant rules
put('/provider-access/:grantId/rules', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, policyRulesArraySchema);
  if ('error' in parsed) return parsed.error;

  const rules = await policyService.setGrantRules(params.grantId, parsed.data);
  if (rules === null) {
    return errorResponse('Grant not found', 404);
  }

  return json({ rules });
});

// ============================================================================
// Provider Default Rules
// ============================================================================

// Get provider default rules
get('/providers/:providerId/default-rules', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const hasAccess = await providerService.hasProviderAccess(user.id, params.providerId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const rules = await policyService.getProviderDefaultRules(params.providerId);
  return json({ rules });
});

// Replace provider default rules
put('/providers/:providerId/default-rules', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const hasAccess = await providerService.hasProviderAccess(user.id, params.providerId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const parsed = await parseBody(request, policyRulesArraySchema);
  if ('error' in parsed) return parsed.error;

  const rules = await policyService.setProviderDefaultRules(params.providerId, parsed.data);
  if (rules === null) {
    return errorResponse('Provider not found', 404);
  }

  return json({ rules });
});

// ============================================================================
// Dry-Run Evaluation
// ============================================================================

post('/policies/evaluate', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, evaluatePolicySchema);
  if ('error' in parsed) return parsed.error;

  const { workflowId, providerId, action, parameters } = parsed.data;

  // Check user has access to the workflow
  const hasAccess = await hasWorkflowAccess(user.id, workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const result = await policyService.evaluateAction(workflowId, providerId, action, parameters);

  // Format the chain for readable output
  const chainEvaluated = result.chain.rules.map((rule) => {
    const actionDesc = rule.action === null ? '*' : rule.action;
    const constraintDesc = rule.parameterConstraints
      ? ` where ${Object.entries(rule.parameterConstraints)
          .map(([k, v]) => {
            if (v.in) return `${k} IN [${v.in.join(', ')}]`;
            if (v.eq !== undefined) return `${k} = ${v.eq}`;
            if (v.pattern) return `${k} ~ ${v.pattern}`;
            if (v.startsWith) return `${k} starts with ${v.startsWith}`;
            if (v.notIn) return `${k} NOT IN [${v.notIn.join(', ')}]`;
            return k;
          })
          .join(', ')}`
      : '';

    return {
      rule: `${rule.effect} ${actionDesc}${constraintDesc}`,
      source: rule.source,
      matched: rule === result.matchedRule,
    };
  });

  return json({
    decision: result.decision,
    matchedRule: result.matchedRule
      ? {
          effect: result.matchedRule.effect,
          action: result.matchedRule.action,
          source: result.matchedRule.source,
          description: result.matchedRule.description,
        }
      : null,
    chainEvaluated,
  });
});
