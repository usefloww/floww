import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

// ===== Types =====

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  namespaceId: string;
  active: boolean | null;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDetail extends WorkflowListItem {
  triggersMetadata: {};
  activeDeployment: {
    id: string;
    deployedAt: string;
    status: string;
  } | null;
}

export interface FolderInfo {
  id: string;
  name: string;
  namespaceId: string;
  parentFolderId: string | null;
}

// ===== Workflows =====

/**
 * List workflows for the current user
 */
export const getWorkflows = createServerFn({ method: 'GET' })
  .inputValidator((input: {
    namespaceId?: string;
    parentFolderId?: string | null;
    rootOnly?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
  } | undefined) => input ?? {})
  .handler(async ({ data = {} }): Promise<{ results: WorkflowListItem[]; total: number }> => {
    const user = await requireUser();
    const { listWorkflows } = await import('~/server/services/workflow-service');

    const folderId = data.rootOnly ? null : data.parentFolderId;
    
    const result = await listWorkflows(user.id, {
      namespaceId: data.namespaceId,
      folderId,
      limit: data.limit ?? 50,
      offset: data.offset ?? 0,
      search: data.search,
    });

    return {
      results: result.workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        namespaceId: w.namespaceId,
        active: w.active,
        parentFolderId: w.parentFolderId,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      })),
      total: result.total,
    };
  });

/**
 * Get a single workflow by ID
 */
export const getWorkflow = createServerFn({ method: 'GET' })
  .inputValidator((input: { workflowId: string }) => input)
  .handler(async ({ data }): Promise<WorkflowDetail> => {
    const user = await requireUser();
    const { getWorkflow: getWf, getActiveDeployment } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const workflow = await getWf(data.workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const hasAccess = await hasWorkflowAccess(user.id, workflow.id);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const deployment = await getActiveDeployment(workflow.id);

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      namespaceId: workflow.namespaceId,
      active: workflow.active,
      parentFolderId: workflow.parentFolderId,
      triggersMetadata: (workflow.triggersMetadata ?? {}) as {},
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      activeDeployment: deployment
        ? {
            id: deployment.id,
            deployedAt: deployment.deployedAt.toISOString(),
            status: deployment.status,
          }
        : null,
    };
  });

/**
 * Create a new workflow
 */
export const createWorkflow = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    namespaceId: string;
    name: string;
    description?: string;
    parentFolderId?: string;
  }) => input)
  .handler(async ({ data }): Promise<WorkflowListItem> => {
    const user = await requireUser();
    const { createWorkflow: create, isWorkflowNameUnique } = await import('~/server/services/workflow-service');
    const { checkWorkflowLimit } = await import('~/server/services/billing-service');

    // Check workflow limit
    const limitCheck = await checkWorkflowLimit(data.namespaceId);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message);
    }

    // Check name uniqueness
    const isUnique = await isWorkflowNameUnique(data.namespaceId, data.name);
    if (!isUnique) {
      throw new Error('A workflow with this name already exists');
    }

    const workflow = await create({
      namespaceId: data.namespaceId,
      name: data.name,
      description: data.description,
      createdById: user.id,
      parentFolderId: data.parentFolderId,
    });

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      namespaceId: workflow.namespaceId,
      active: workflow.active,
      parentFolderId: workflow.parentFolderId,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  });

/**
 * Update a workflow
 */
export const updateWorkflow = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    workflowId: string;
    name?: string;
    description?: string | null;
    parentFolderId?: string | null;
    active?: boolean;
    triggersMetadata?: unknown;
  }) => input)
  .handler(async ({ data }): Promise<WorkflowListItem> => {
    const user = await requireUser();
    const { updateWorkflow: update } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const workflow = await update(data.workflowId, {
      name: data.name,
      description: data.description,
      parentFolderId: data.parentFolderId,
      active: data.active,
      triggersMetadata: data.triggersMetadata,
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      namespaceId: workflow.namespaceId,
      active: workflow.active,
      parentFolderId: workflow.parentFolderId,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  });

/**
 * Delete a workflow
 */
export const deleteWorkflow = createServerFn({ method: 'POST' })
  .inputValidator((input: { workflowId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const user = await requireUser();
    const { deleteWorkflow: del } = await import('~/server/services/workflow-service');
    const { hasWorkflowAccess } = await import('~/server/services/access-service');

    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    await del(data.workflowId);
    return { success: true };
  });

/**
 * Import workflow from n8n format
 */
export const importN8nWorkflow = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    namespaceId: string;
    n8nJson: unknown;
    name?: string;
  }) => input)
  .handler(async ({ data }): Promise<WorkflowListItem> => {
    const user = await requireUser();
    const { importFromN8n } = await import('~/server/services/workflow-service');
    const { checkWorkflowLimit } = await import('~/server/services/billing-service');

    // Check workflow limit
    const limitCheck = await checkWorkflowLimit(data.namespaceId);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message);
    }

    const workflow = await importFromN8n({
      namespaceId: data.namespaceId,
      n8nWorkflow: data.n8nJson as Record<string, unknown>,
      name: data.name,
      createdById: user.id,
    });

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      namespaceId: workflow.namespaceId,
      active: workflow.active,
      parentFolderId: workflow.parentFolderId,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  });

// ===== Folders =====

/**
 * List folders for the current user
 */
export const getFolders = createServerFn({ method: 'GET' })
  .inputValidator((input: {
    namespaceId?: string;
    parentFolderId?: string | null;
  } | undefined) => input ?? {})
  .handler(async ({ data = {} }): Promise<{ results: FolderInfo[] }> => {
    const user = await requireUser();
    const { listFolders } = await import('~/server/services/workflow-service');

    const folders = await listFolders(user.id, {
      namespaceId: data.namespaceId,
      parentFolderId: data.parentFolderId,
    });

    return {
      results: folders.map((f) => ({
        id: f.id,
        name: f.name,
        namespaceId: f.namespaceId,
        parentFolderId: f.parentFolderId,
      })),
    };
  });

/**
 * Get folder path (breadcrumbs)
 */
export const getFolderPath = createServerFn({ method: 'GET' })
  .inputValidator((input: { folderId: string }) => input)
  .handler(async ({ data }): Promise<{ results: Array<{ id: string; name: string }> }> => {
    await requireUser();
    const { getFolderPath: getPath } = await import('~/server/services/workflow-service');

    const path = await getPath(data.folderId);

    return {
      results: path.map((f) => ({
        id: f.id,
        name: f.name,
      })),
    };
  });

/**
 * Create a new folder
 */
export const createFolder = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    namespaceId: string;
    name: string;
    parentFolderId?: string;
  }) => input)
  .handler(async ({ data }): Promise<FolderInfo> => {
    await requireUser();
    const { createFolder: create } = await import('~/server/services/workflow-service');

    const folder = await create({
      namespaceId: data.namespaceId,
      name: data.name,
      parentFolderId: data.parentFolderId,
    });

    return {
      id: folder.id,
      name: folder.name,
      namespaceId: folder.namespaceId,
      parentFolderId: folder.parentFolderId,
    };
  });

/**
 * Update a folder
 */
export const updateFolder = createServerFn({ method: 'POST' })
  .inputValidator((input: {
    folderId: string;
    name?: string;
    parentFolderId?: string | null;
  }) => input)
  .handler(async ({ data }): Promise<FolderInfo> => {
    await requireUser();
    const { updateFolder: update } = await import('~/server/services/workflow-service');

    const folder = await update(data.folderId, {
      name: data.name,
      parentFolderId: data.parentFolderId,
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    return {
      id: folder.id,
      name: folder.name,
      namespaceId: folder.namespaceId,
      parentFolderId: folder.parentFolderId,
    };
  });

/**
 * Delete a folder
 */
export const deleteFolder = createServerFn({ method: 'POST' })
  .inputValidator((input: { folderId: string }) => input)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requireUser();
    const { deleteFolder: del } = await import('~/server/services/workflow-service');

    await del(data.folderId);
    return { success: true };
  });
