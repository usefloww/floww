/**
 * Policy Service
 *
 * Handles building rule chains from grant + provider default rules,
 * evaluating actions against those chains, and CRUD for rules on
 * both provider_access grants and providers.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  providers,
  providerAccess,
  workflows,
  workflowFolders,
} from '~/server/db/schema';
import type {
  PolicyRule,
  PolicyRuleWithSource,
  PolicyRuleChain,
  PolicyEvaluationResult,
} from 'floww/policies';
import { evaluateRuleChain } from 'floww/policies';

// ============================================================================
// Rule Chain Building
// ============================================================================

/**
 * Find the most specific provider_access grant for a workflow accessing a provider.
 *
 * Specificity order:
 * 1. Direct WORKFLOW grant
 * 2. FOLDER grant for the workflow's immediate parent folder
 * 3. FOLDER grant for ancestor folders (nearest first)
 */
export async function findApplicableGrant(
  workflowId: string,
  providerId: string
): Promise<{ id: string; policyRules: PolicyRule[] | null } | null> {
  const db = getDb();

  // 1. Check direct WORKFLOW grant
  const [directGrant] = await db
    .select({ id: providerAccess.id, policyRules: providerAccess.policyRules })
    .from(providerAccess)
    .where(
      and(
        eq(providerAccess.principleType, 'WORKFLOW'),
        eq(providerAccess.principleId, workflowId),
        eq(providerAccess.resourceType, 'PROVIDER'),
        eq(providerAccess.resourceId, providerId)
      )
    )
    .limit(1);

  if (directGrant) {
    return {
      id: directGrant.id,
      policyRules: directGrant.policyRules as PolicyRule[] | null,
    };
  }

  // 2. Check FOLDER grants via workflow's folder hierarchy
  const [workflow] = await db
    .select({ parentFolderId: workflows.parentFolderId })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow?.parentFolderId) return null;

  // Walk up the folder hierarchy, checking for grants at each level
  let currentFolderId: string | null = workflow.parentFolderId;
  while (currentFolderId) {
    const [folderGrant] = await db
      .select({ id: providerAccess.id, policyRules: providerAccess.policyRules })
      .from(providerAccess)
      .where(
        and(
          eq(providerAccess.principleType, 'FOLDER'),
          eq(providerAccess.principleId, currentFolderId),
          eq(providerAccess.resourceType, 'PROVIDER'),
          eq(providerAccess.resourceId, providerId)
        )
      )
      .limit(1);

    if (folderGrant) {
      return {
        id: folderGrant.id,
        policyRules: folderGrant.policyRules as PolicyRule[] | null,
      };
    }

    // Move to parent folder
    const [folder] = await db
      .select({ parentFolderId: workflowFolders.parentFolderId })
      .from(workflowFolders)
      .where(eq(workflowFolders.id, currentFolderId))
      .limit(1);

    currentFolderId = folder?.parentFolderId ?? null;
  }

  return null;
}

/**
 * Get the default policy rules for a provider.
 */
export async function getProviderDefaultRules(providerId: string): Promise<PolicyRule[]> {
  const db = getDb();

  const [provider] = await db
    .select({ defaultPolicyRules: providers.defaultPolicyRules })
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);

  if (!provider?.defaultPolicyRules) return [];
  return provider.defaultPolicyRules as PolicyRule[];
}

/**
 * Build the complete rule chain for a workflow accessing a provider.
 * Chain = [Grant Rules] ++ [Provider Default Rules]
 */
export async function buildRuleChain(
  workflowId: string,
  providerId: string
): Promise<PolicyRuleChain> {
  const rules: PolicyRuleWithSource[] = [];

  // Get grant rules
  const grant = await findApplicableGrant(workflowId, providerId);
  if (grant?.policyRules) {
    for (const rule of grant.policyRules) {
      rules.push({ ...rule, source: 'grant' });
    }
  }

  // Get provider default rules
  const defaultRules = await getProviderDefaultRules(providerId);
  for (const rule of defaultRules) {
    rules.push({ ...rule, source: 'default' });
  }

  return { rules };
}

// ============================================================================
// Rule Evaluation
// ============================================================================

/**
 * Evaluate whether an action is allowed for a workflow using a specific provider.
 * Builds the rule chain and evaluates it.
 */
export async function evaluateAction(
  workflowId: string,
  providerId: string,
  action: string,
  parameters: Record<string, unknown> = {}
): Promise<PolicyEvaluationResult & { chain: PolicyRuleChain }> {
  const chain = await buildRuleChain(workflowId, providerId);
  const result = evaluateRuleChain(chain, action, parameters);
  return { ...result, chain };
}

// ============================================================================
// Grant Rules CRUD
// ============================================================================

/**
 * Get the policy rules for a specific provider_access grant.
 */
export async function getGrantRules(grantId: string): Promise<PolicyRule[] | null> {
  const db = getDb();

  const [grant] = await db
    .select({ policyRules: providerAccess.policyRules })
    .from(providerAccess)
    .where(eq(providerAccess.id, grantId))
    .limit(1);

  if (!grant) return null;
  return (grant.policyRules as PolicyRule[] | null) ?? [];
}

/**
 * Replace the entire policy rules array for a provider_access grant.
 */
export async function setGrantRules(
  grantId: string,
  rules: PolicyRule[]
): Promise<PolicyRule[] | null> {
  const db = getDb();

  const [updated] = await db
    .update(providerAccess)
    .set({ policyRules: rules.length > 0 ? rules : null })
    .where(eq(providerAccess.id, grantId))
    .returning({ policyRules: providerAccess.policyRules });

  if (!updated) return null;
  return (updated.policyRules as PolicyRule[] | null) ?? [];
}

// ============================================================================
// Provider Default Rules CRUD
// ============================================================================

/**
 * Set the default policy rules for a provider.
 */
export async function setProviderDefaultRules(
  providerId: string,
  rules: PolicyRule[]
): Promise<PolicyRule[] | null> {
  const db = getDb();

  const [updated] = await db
    .update(providers)
    .set({ defaultPolicyRules: rules.length > 0 ? rules : null })
    .where(eq(providers.id, providerId))
    .returning({ defaultPolicyRules: providers.defaultPolicyRules });

  if (!updated) return null;
  return (updated.defaultPolicyRules as PolicyRule[] | null) ?? [];
}

// ============================================================================
// Build Rule Chains for All Providers in a Deployment
// ============================================================================

/**
 * Build rule chains for all providers used by a workflow.
 * Returns a map keyed by "type:alias" for injection into the runtime payload.
 */
export async function buildRuleChainsForDeployment(
  workflowId: string,
  providerMappings: Record<string, Record<string, string>>
): Promise<Record<string, PolicyRuleChain>> {
  const chains: Record<string, PolicyRuleChain> = {};

  for (const [providerType, aliasMap] of Object.entries(providerMappings)) {
    for (const [codeAlias, providerId] of Object.entries(aliasMap)) {
      const chain = await buildRuleChain(workflowId, providerId);
      // Only include chains that have rules (optimization)
      if (chain.rules.length > 0) {
        const key = `${providerType}:${codeAlias}`;
        chains[key] = chain;
      }
    }
  }

  return chains;
}

/**
 * Build rule chains for all providers in a namespace (legacy: no provider mappings).
 * Uses provider type:alias as key.
 */
export async function buildRuleChainsForNamespace(
  workflowId: string,
  namespaceId: string
): Promise<Record<string, PolicyRuleChain>> {
  const db = getDb();
  const chains: Record<string, PolicyRuleChain> = {};

  const namespaceProviders = await db
    .select({ id: providers.id, type: providers.type, alias: providers.alias })
    .from(providers)
    .where(eq(providers.namespaceId, namespaceId));

  for (const provider of namespaceProviders) {
    const chain = await buildRuleChain(workflowId, provider.id);
    if (chain.rules.length > 0) {
      const key = `${provider.type}:${provider.alias}`;
      chains[key] = chain;
    }
  }

  return chains;
}
