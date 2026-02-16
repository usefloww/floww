/**
 * Workflow Service
 *
 * Handles workflow CRUD operations, deployments, and folder management
 */

import { eq, and, desc, asc, isNull, inArray, sql, ilike } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  workflows,
  workflowDeployments,
  workflowFolders,
  namespaces,
  organizationMembers,
} from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';

export interface WorkflowInfo {
  id: string;
  namespaceId: string;
  name: string;
  description: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  triggersMetadata: unknown;
  active: boolean | null;
  parentFolderId: string | null;
}

export interface WorkflowDeploymentInfo {
  id: string;
  workflowId: string;
  runtimeId: string;
  deployedById: string | null;
  userCode: unknown;
  providerDefinitions: unknown;
  triggerDefinitions: unknown;
  providerMappings: unknown;
  deployedAt: Date;
  status: 'ACTIVE' | 'INACTIVE' | 'FAILED';
  note: string | null;
}

export interface WorkflowFolderInfo {
  id: string;
  namespaceId: string;
  name: string;
  parentFolderId: string | null;
}

/**
 * Get a workflow by ID
 */
export async function getWorkflow(workflowId: string): Promise<WorkflowInfo | null> {
  const db = getDb();

  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);

  if (!workflow) {
    return null;
  }

  return {
    id: workflow.id,
    namespaceId: workflow.namespaceId,
    name: workflow.name,
    description: workflow.description,
    createdById: workflow.createdById,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    triggersMetadata: workflow.triggersMetadata,
    active: workflow.active,
    parentFolderId: workflow.parentFolderId,
  };
}

/**
 * List workflows accessible to a user
 */
export async function listWorkflows(
  userId: string,
  options: {
    namespaceId?: string;
    folderId?: string | null; // null means root level (no parent folder)
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'updatedAt' | 'createdAt';
    orderDir?: 'asc' | 'desc';
    search?: string;
    activeOnly?: boolean;
  } = {}
): Promise<{ workflows: WorkflowInfo[]; total: number }> {
  const db = getDb();
  const {
    namespaceId,
    folderId,
    limit = 50,
    offset = 0,
    orderBy = 'updatedAt',
    orderDir = 'desc',
    search,
    activeOnly = false,
  } = options;

  // Build base query with namespace access filter
  const baseConditions = [
    inArray(
      workflows.namespaceId,
      db
        .select({ id: namespaces.id })
        .from(namespaces)
        .innerJoin(
          organizationMembers,
          eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
        )
        .where(eq(organizationMembers.userId, userId))
    ),
  ];

  if (namespaceId) {
    baseConditions.push(eq(workflows.namespaceId, namespaceId));
  }

  if (folderId === null) {
    baseConditions.push(isNull(workflows.parentFolderId));
  } else if (folderId) {
    baseConditions.push(eq(workflows.parentFolderId, folderId));
  }

  if (activeOnly) {
    baseConditions.push(eq(workflows.active, true));
  }

  if (search) {
    baseConditions.push(ilike(workflows.name, `%${search}%`));
  }

  // Get total count
  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workflows)
    .where(and(...baseConditions));

  // Build order clause
  const orderColumn =
    orderBy === 'name'
      ? workflows.name
      : orderBy === 'createdAt'
        ? workflows.createdAt
        : workflows.updatedAt;
  const orderClause = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

  // Get workflows
  const result = await db
    .select()
    .from(workflows)
    .where(and(...baseConditions))
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset);

  return {
    workflows: result.map((w) => ({
      id: w.id,
      namespaceId: w.namespaceId,
      name: w.name,
      description: w.description,
      createdById: w.createdById,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      triggersMetadata: w.triggersMetadata,
      active: w.active,
      parentFolderId: w.parentFolderId,
    })),
    total,
  };
}

/**
 * Create a new workflow
 */
export async function createWorkflow(params: {
  namespaceId: string;
  name: string;
  description?: string;
  createdById?: string;
  parentFolderId?: string;
  triggersMetadata?: unknown;
}): Promise<WorkflowInfo> {
  const db = getDb();

  const [workflow] = await db
    .insert(workflows)
    .values({
      id: generateUlidUuid(),
      namespaceId: params.namespaceId,
      name: params.name,
      description: params.description ?? null,
      createdById: params.createdById ?? null,
      parentFolderId: params.parentFolderId ?? null,
      triggersMetadata: params.triggersMetadata ?? null,
      active: true,
    })
    .returning();

  return {
    id: workflow.id,
    namespaceId: workflow.namespaceId,
    name: workflow.name,
    description: workflow.description,
    createdById: workflow.createdById,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    triggersMetadata: workflow.triggersMetadata,
    active: workflow.active,
    parentFolderId: workflow.parentFolderId,
  };
}

/**
 * Update a workflow
 */
export async function updateWorkflow(
  workflowId: string,
  updates: {
    name?: string;
    description?: string | null;
    parentFolderId?: string | null;
    triggersMetadata?: unknown;
    active?: boolean;
  }
): Promise<WorkflowInfo | null> {
  const db = getDb();

  const [workflow] = await db
    .update(workflows)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, workflowId))
    .returning();

  if (!workflow) {
    return null;
  }

  return {
    id: workflow.id,
    namespaceId: workflow.namespaceId,
    name: workflow.name,
    description: workflow.description,
    createdById: workflow.createdById,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    triggersMetadata: workflow.triggersMetadata,
    active: workflow.active,
    parentFolderId: workflow.parentFolderId,
  };
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<boolean> {
  const db = getDb();

  await db.delete(workflows).where(eq(workflows.id, workflowId));

  return true;
}

// ===== Deployments =====

/**
 * Get the active deployment for a workflow
 */
export async function getActiveDeployment(
  workflowId: string
): Promise<WorkflowDeploymentInfo | null> {
  const db = getDb();

  const [deployment] = await db
    .select()
    .from(workflowDeployments)
    .where(
      and(eq(workflowDeployments.workflowId, workflowId), eq(workflowDeployments.status, 'ACTIVE'))
    )
    .orderBy(desc(workflowDeployments.deployedAt))
    .limit(1);

  if (!deployment) {
    return null;
  }

  return {
    id: deployment.id,
    workflowId: deployment.workflowId,
    runtimeId: deployment.runtimeId,
    deployedById: deployment.deployedById,
    userCode: deployment.userCode,
    providerDefinitions: deployment.providerDefinitions,
    triggerDefinitions: deployment.triggerDefinitions,
    providerMappings: deployment.providerMappings,
    deployedAt: deployment.deployedAt,
    status: deployment.status,
    note: deployment.note,
  };
}

/**
 * Get a deployment by ID
 */
export async function getDeployment(deploymentId: string): Promise<WorkflowDeploymentInfo | null> {
  const db = getDb();

  const [deployment] = await db
    .select()
    .from(workflowDeployments)
    .where(eq(workflowDeployments.id, deploymentId))
    .limit(1);

  if (!deployment) {
    return null;
  }

  return {
    id: deployment.id,
    workflowId: deployment.workflowId,
    runtimeId: deployment.runtimeId,
    deployedById: deployment.deployedById,
    userCode: deployment.userCode,
    providerDefinitions: deployment.providerDefinitions,
    triggerDefinitions: deployment.triggerDefinitions,
    providerMappings: deployment.providerMappings,
    deployedAt: deployment.deployedAt,
    status: deployment.status,
    note: deployment.note,
  };
}

/**
 * List deployments for a workflow
 */
export async function listDeployments(
  workflowId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<WorkflowDeploymentInfo[]> {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  const result = await db
    .select()
    .from(workflowDeployments)
    .where(eq(workflowDeployments.workflowId, workflowId))
    .orderBy(desc(workflowDeployments.deployedAt))
    .limit(limit)
    .offset(offset);

  return result.map((d) => ({
    id: d.id,
    workflowId: d.workflowId,
    runtimeId: d.runtimeId,
    deployedById: d.deployedById,
    userCode: d.userCode,
    providerDefinitions: d.providerDefinitions,
    triggerDefinitions: d.triggerDefinitions,
    providerMappings: d.providerMappings,
    deployedAt: d.deployedAt,
    status: d.status,
    note: d.note,
  }));
}

/**
 * Create a new deployment (and deactivate previous active deployment)
 */
export async function createDeployment(params: {
  workflowId: string;
  runtimeId: string;
  deployedById?: string;
  userCode: unknown;
  providerDefinitions?: unknown;
  triggerDefinitions?: unknown;
  providerMappings?: unknown;
  note?: string;
}): Promise<WorkflowDeploymentInfo> {
  const db = getDb();

  // Deactivate previous active deployment
  await db
    .update(workflowDeployments)
    .set({ status: 'INACTIVE' })
    .where(
      and(
        eq(workflowDeployments.workflowId, params.workflowId),
        eq(workflowDeployments.status, 'ACTIVE')
      )
    );

  // Create new deployment
  const [deployment] = await db
    .insert(workflowDeployments)
    .values({
      id: generateUlidUuid(),
      workflowId: params.workflowId,
      runtimeId: params.runtimeId,
      deployedById: params.deployedById ?? null,
      userCode: params.userCode,
      providerDefinitions: params.providerDefinitions ?? null,
      triggerDefinitions: params.triggerDefinitions ?? null,
      providerMappings: params.providerMappings ?? null,
      status: 'ACTIVE',
      note: params.note ?? null,
    })
    .returning();

  // Update workflow's updatedAt
  await db
    .update(workflows)
    .set({ updatedAt: new Date() })
    .where(eq(workflows.id, params.workflowId));

  return {
    id: deployment.id,
    workflowId: deployment.workflowId,
    runtimeId: deployment.runtimeId,
    deployedById: deployment.deployedById,
    userCode: deployment.userCode,
    providerDefinitions: deployment.providerDefinitions,
    triggerDefinitions: deployment.triggerDefinitions,
    providerMappings: deployment.providerMappings,
    deployedAt: deployment.deployedAt,
    status: deployment.status,
    note: deployment.note,
  };
}

/**
 * Update a deployment status
 */
export async function updateDeploymentStatus(
  deploymentId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'FAILED'
): Promise<WorkflowDeploymentInfo | null> {
  const db = getDb();

  const [deployment] = await db
    .update(workflowDeployments)
    .set({ status })
    .where(eq(workflowDeployments.id, deploymentId))
    .returning();

  if (!deployment) {
    return null;
  }

  return {
    id: deployment.id,
    workflowId: deployment.workflowId,
    runtimeId: deployment.runtimeId,
    deployedById: deployment.deployedById,
    userCode: deployment.userCode,
    providerDefinitions: deployment.providerDefinitions,
    triggerDefinitions: deployment.triggerDefinitions,
    providerMappings: deployment.providerMappings,
    deployedAt: deployment.deployedAt,
    status: deployment.status,
    note: deployment.note,
  };
}

// ===== Folders =====

/**
 * Get a folder by ID
 */
export async function getFolder(folderId: string): Promise<WorkflowFolderInfo | null> {
  const db = getDb();

  const [folder] = await db
    .select()
    .from(workflowFolders)
    .where(eq(workflowFolders.id, folderId))
    .limit(1);

  if (!folder) {
    return null;
  }

  return {
    id: folder.id,
    namespaceId: folder.namespaceId,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
  };
}

/**
 * List folders in a namespace
 */
export async function listFolders(
  userId: string,
  options: {
    namespaceId?: string;
    parentFolderId?: string | null;
  } = {}
): Promise<WorkflowFolderInfo[]> {
  const db = getDb();
  const { namespaceId, parentFolderId } = options;

  const conditions = [
    inArray(
      workflowFolders.namespaceId,
      db
        .select({ id: namespaces.id })
        .from(namespaces)
        .innerJoin(
          organizationMembers,
          eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
        )
        .where(eq(organizationMembers.userId, userId))
    ),
  ];

  if (namespaceId) {
    conditions.push(eq(workflowFolders.namespaceId, namespaceId));
  }

  if (parentFolderId === null) {
    conditions.push(isNull(workflowFolders.parentFolderId));
  } else if (parentFolderId) {
    conditions.push(eq(workflowFolders.parentFolderId, parentFolderId));
  }

  const result = await db
    .select()
    .from(workflowFolders)
    .where(and(...conditions))
    .orderBy(asc(workflowFolders.name));

  return result.map((f) => ({
    id: f.id,
    namespaceId: f.namespaceId,
    name: f.name,
    parentFolderId: f.parentFolderId,
  }));
}

/**
 * Create a new folder
 */
export async function createFolder(params: {
  namespaceId: string;
  name: string;
  parentFolderId?: string;
}): Promise<WorkflowFolderInfo> {
  const db = getDb();

  const [folder] = await db
    .insert(workflowFolders)
    .values({
      id: generateUlidUuid(),
      namespaceId: params.namespaceId,
      name: params.name,
      parentFolderId: params.parentFolderId ?? null,
    })
    .returning();

  return {
    id: folder.id,
    namespaceId: folder.namespaceId,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
  };
}

/**
 * Update a folder
 */
export async function updateFolder(
  folderId: string,
  updates: {
    name?: string;
    parentFolderId?: string | null;
  }
): Promise<WorkflowFolderInfo | null> {
  const db = getDb();

  const [folder] = await db
    .update(workflowFolders)
    .set(updates)
    .where(eq(workflowFolders.id, folderId))
    .returning();

  if (!folder) {
    return null;
  }

  return {
    id: folder.id,
    namespaceId: folder.namespaceId,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
  };
}

/**
 * Delete a folder (cascades to contained workflows and subfolders)
 */
export async function deleteFolder(folderId: string): Promise<boolean> {
  const db = getDb();

  await db.delete(workflowFolders).where(eq(workflowFolders.id, folderId));

  return true;
}

/**
 * Check if a workflow name is unique within a namespace
 */
export async function isWorkflowNameUnique(
  namespaceId: string,
  name: string,
  excludeWorkflowId?: string
): Promise<boolean> {
  const db = getDb();

  const conditions = [eq(workflows.namespaceId, namespaceId), eq(workflows.name, name)];

  if (excludeWorkflowId) {
    conditions.push(sql`${workflows.id} != ${excludeWorkflowId}`);
  }

  const [existing] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(...conditions))
    .limit(1);

  return !existing;
}

/**
 * Get the path from root to a folder (breadcrumbs)
 */
export async function getFolderPath(folderId: string): Promise<WorkflowFolderInfo[]> {
  const path: WorkflowFolderInfo[] = [];
  let currentFolderId: string | null = folderId;

  while (currentFolderId) {
    const folder = await getFolder(currentFolderId);
    if (!folder) break;
    path.unshift(folder);
    currentFolderId = folder.parentFolderId;
  }

  return path;
}

/**
 * Delete a deployment
 */
export async function deleteDeployment(deploymentId: string): Promise<boolean> {
  const db = getDb();

  const result = await db.delete(workflowDeployments).where(eq(workflowDeployments.id, deploymentId));

  return result.length > 0;
}

/**
 * Import a workflow from n8n format (stub for future implementation)
 */
export async function importFromN8n(params: {
  namespaceId: string;
  n8nWorkflow: Record<string, unknown>;
  name?: string;
  createdById?: string;
}): Promise<WorkflowInfo> {
  // For now, just create a basic workflow with the n8n data stored
  // Full implementation would parse and convert the n8n workflow format
  return createWorkflow({
    namespaceId: params.namespaceId,
    name: params.name ?? 'Imported from n8n',
    description: 'Imported from n8n workflow',
    createdById: params.createdById,
  });
}
