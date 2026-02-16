/**
 * Dev Routes
 *
 * Development/testing utilities. Only available in development mode.
 *
 * POST /dev/sync-triggers - Sync all triggers
 */

import { post, json, errorResponse } from '~/server/api/router';
import { getDb } from '~/server/db';
import { workflowDeployments, workflows } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import { syncTriggers } from '~/server/services/trigger-service';

// Sync all triggers across all deployments
post('/dev/sync-triggers', async ({ user }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  // Check environment at runtime, not module load time
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !user.isAdmin) {
    return errorResponse('This endpoint is only available in development mode', 403);
  }

  const db = getDb();

  // Get all active deployments
  const deployments = await db
    .select({
      id: workflowDeployments.id,
      workflowId: workflowDeployments.workflowId,
    })
    .from(workflowDeployments)
    .innerJoin(workflows, eq(workflowDeployments.workflowId, workflows.id))
    .where(eq(workflowDeployments.status, 'ACTIVE'));

  const results: Array<{ deploymentId: string; status: string; error?: string }> = [];

  for (const deployment of deployments) {
    try {
      // Get workflow namespace for syncing
      const workflow = await db
        .select({ namespaceId: workflows.namespaceId, triggersMetadata: workflows.triggersMetadata })
        .from(workflows)
        .where(eq(workflows.id, deployment.workflowId))
        .limit(1);

      if (workflow.length > 0) {
        const triggersMetadata = (workflow[0].triggersMetadata as unknown[]) || [];
        await syncTriggers(
          deployment.workflowId,
          workflow[0].namespaceId,
          triggersMetadata as Parameters<typeof syncTriggers>[2]
        );
      }
      results.push({ deploymentId: deployment.id, status: 'success' });
    } catch (error) {
      results.push({
        deploymentId: deployment.id,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return json({
    synced: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  });
});
