import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface DeploymentInfo {
  id: string;
  workflowId: string;
  runtimeId: string;
  deployedById: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'FAILED';
  deployedAt: string;
  note: string | null;
  userCode?: {} | undefined;
  providerDefinitions?: {} | undefined;
  triggerDefinitions?: {} | undefined;
}

/**
 * Get a single deployment by ID
 */
export const getDeployment = createServerFn({ method: 'GET' })
  .inputValidator((input: { deploymentId: string }) => input)
  .handler(async ({ data }): Promise<DeploymentInfo> => {
    const user = await requireUser();
    const { getDeployment: get } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const deployment = await get(data.deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, deployment.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return {
      id: deployment.id,
      workflowId: deployment.workflowId,
      runtimeId: deployment.runtimeId,
      deployedById: deployment.deployedById,
      status: deployment.status,
      deployedAt: deployment.deployedAt.toISOString(),
      note: deployment.note,
      userCode: deployment.userCode as {} | undefined,
      providerDefinitions: deployment.providerDefinitions as {} | undefined,
      triggerDefinitions: deployment.triggerDefinitions as {} | undefined,
    };
  });

/**
 * List deployments for a workflow
 */
export const getDeployments = createServerFn({ method: 'GET' })
  .inputValidator((input: {
    workflowId: string;
    limit?: number;
    offset?: number;
  }) => input)
  .handler(async ({ data }): Promise<{ results: DeploymentInfo[] }> => {
    const user = await requireUser();
    const { listDeployments } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const deployments = await listDeployments(data.workflowId, {
      limit: data.limit ?? 50,
      offset: data.offset ?? 0,
    });

    return {
      results: deployments.map((d) => ({
        id: d.id,
        workflowId: d.workflowId,
        runtimeId: d.runtimeId,
        deployedById: d.deployedById,
        status: d.status,
        deployedAt: d.deployedAt.toISOString(),
        note: d.note,
      })),
    };
  });

/**
 * Create a new deployment
 */
export const createDeployment = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    workflowId: string;
    runtimeId: string;
    userCode: unknown;
    providerDefinitions?: unknown;
    triggerDefinitions?: unknown;
    note?: string;
  }) => input)
  .handler(async ({ data }): Promise<DeploymentInfo> => {
    const user = await requireUser();
    const { createDeployment: create } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const deployment = await create({
      workflowId: data.workflowId,
      runtimeId: data.runtimeId,
      deployedById: user.id,
      userCode: data.userCode,
      providerDefinitions: data.providerDefinitions,
      triggerDefinitions: data.triggerDefinitions,
      note: data.note,
    });

    return {
      id: deployment.id,
      workflowId: deployment.workflowId,
      runtimeId: deployment.runtimeId,
      deployedById: deployment.deployedById,
      status: deployment.status,
      deployedAt: deployment.deployedAt.toISOString(),
      note: deployment.note,
    };
  });

/**
 * Update a deployment (typically to update user code)
 */
export const updateDeployment = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    deploymentId: string;
    userCode?: {
      files: Record<string, string>;
      entrypoint: string;
    };
    status?: 'ACTIVE' | 'INACTIVE' | 'FAILED';
  }) => input)
  .handler(async ({ data }): Promise<DeploymentInfo> => {
    const user = await requireUser();
    const { getDeployment: get, updateDeploymentStatus } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');
    const { eq } = await import('drizzle-orm');
    const { getDb } = await import('~/server/db');
    const { workflowDeployments } = await import('~/server/db/schema');

    const deployment = await get(data.deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, deployment.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // Update user code if provided
    if (data.userCode) {
      const db = getDb();
      await db
        .update(workflowDeployments)
        .set({ userCode: data.userCode })
        .where(eq(workflowDeployments.id, data.deploymentId));
    }

    // Update status if provided
    if (data.status) {
      await updateDeploymentStatus(data.deploymentId, data.status);
    }

    // Get updated deployment
    const updated = await get(data.deploymentId);
    if (!updated) {
      throw new Error('Deployment not found after update');
    }

    return {
      id: updated.id,
      workflowId: updated.workflowId,
      runtimeId: updated.runtimeId,
      deployedById: updated.deployedById,
      status: updated.status,
      deployedAt: updated.deployedAt.toISOString(),
      note: updated.note,
      userCode: updated.userCode as {} | undefined,
    };
  });

/**
 * Delete a deployment
 */
export const deleteDeployment = createServerFn({ method: 'POST' })
  .inputValidator((input: { deploymentId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { getDeployment: get, deleteDeployment: del } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const deployment = await get(data.deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, deployment.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    await del(data.deploymentId);
    return { success: true };
  });
