/**
 * Access Control Service
 *
 * Handles permission checking for resources (workflows, folders, providers, namespaces).
 * Uses a hierarchical model where folder access grants access to contained resources.
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { getDb } from '~/server/db';
import {
  providerAccess,
  workflows,
  workflowFolders,
  namespaces,
  organizationMembers,
  type ProviderAccessRecord,
} from '~/server/db/schema';

// Types matching the database enums
export type AccessRole = 'OWNER' | 'USER';
export type ResourceType = 'WORKFLOW' | 'FOLDER' | 'PROVIDER';
export type PrincipalType = 'USER' | 'WORKFLOW' | 'FOLDER';

// Role priority for comparison (higher = more permissive)
const ROLE_PRIORITY: Record<AccessRole, number> = {
  USER: 1,
  OWNER: 2,
};

export interface ResolvedAccess {
  principalType: PrincipalType;
  principalId: string;
  resourceType: ResourceType;
  resourceId: string;
  role: AccessRole;
  inheritedFrom: string | null;
}

function roleMeetsMinimum(role: AccessRole, minRole: AccessRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole];
}

/**
 * Check if a user has access to a workflow via namespace membership
 */
export async function hasWorkflowAccess(userId: string, workflowId: string): Promise<boolean> {
  const db = getDb();

  // Get the workflow and check if user is a member of the organization that owns the namespace
  const result = await db
    .select({ id: workflows.id })
    .from(workflows)
    .innerJoin(namespaces, eq(workflows.namespaceId, namespaces.id))
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(and(eq(workflows.id, workflowId), eq(organizationMembers.userId, userId)))
    .limit(1);

  return result.length > 0;
}

/**
 * Check if a user has access to a namespace via organization membership
 */
export async function hasNamespaceAccess(userId: string, namespaceId: string): Promise<boolean> {
  const db = getDb();

  const result = await db
    .select({ id: namespaces.id })
    .from(namespaces)
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(and(eq(namespaces.id, namespaceId), eq(organizationMembers.userId, userId)))
    .limit(1);

  return result.length > 0;
}

/**
 * Check if a user has access to a folder via namespace membership
 */
export async function hasFolderAccess(userId: string, folderId: string): Promise<boolean> {
  const db = getDb();

  const result = await db
    .select({ id: workflowFolders.id })
    .from(workflowFolders)
    .innerJoin(namespaces, eq(workflowFolders.namespaceId, namespaces.id))
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(and(eq(workflowFolders.id, folderId), eq(organizationMembers.userId, userId)))
    .limit(1);

  return result.length > 0;
}

/**
 * Get all folder ancestors for a given folder using recursive CTE
 */
async function getFolderAncestors(folderId: string): Promise<string[]> {
  const db = getDb();

  // Use recursive CTE to get all ancestor folders
  const result = await db.execute(sql`
    WITH RECURSIVE folder_ancestors AS (
      SELECT id, parent_folder_id, 0 as depth
      FROM workflow_folders
      WHERE id = ${folderId}
      
      UNION ALL
      
      SELECT wf.id, wf.parent_folder_id, fa.depth + 1
      FROM workflow_folders wf
      INNER JOIN folder_ancestors fa ON wf.id = fa.parent_folder_id
    )
    SELECT id FROM folder_ancestors WHERE depth > 0
  `);

  return (result as unknown as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Get all folder descendants for a given folder using recursive CTE
 */
async function getFolderDescendants(folderId: string): Promise<string[]> {
  const db = getDb();

  const result = await db.execute(sql`
    WITH RECURSIVE folder_descendants AS (
      SELECT id, 0 as depth
      FROM workflow_folders
      WHERE id = ${folderId}
      
      UNION ALL
      
      SELECT wf.id, fd.depth + 1
      FROM workflow_folders wf
      INNER JOIN folder_descendants fd ON wf.parent_folder_id = fd.id
    )
    SELECT id FROM folder_descendants WHERE depth > 0
  `);

  return (result as unknown as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Get all resources a principal can access.
 *
 * When expandHierarchy=false: Returns only direct access grants.
 * When expandHierarchy=true: Also includes workflows/folders inherited through folder access.
 */
export async function getAccessibleResources(
  principalType: PrincipalType,
  principalId: string,
  options: {
    resourceType?: ResourceType;
    minRole?: AccessRole;
    expandHierarchy?: boolean;
  } = {}
): Promise<ResolvedAccess[]> {
  const db = getDb();
  const { resourceType, minRole, expandHierarchy = false } = options;

  // Query direct access grants
  const query = db
    .select()
    .from(providerAccess)
    .where(
      and(
        eq(providerAccess.principleType, principalType),
        eq(providerAccess.principleId, principalId)
      )
    );

  const accessTuples = await query;

  // Build results from direct access
  const results = new Map<string, ResolvedAccess>();

  for (const at of accessTuples) {
    if (resourceType && at.resourceType !== resourceType) continue;
    if (minRole && !roleMeetsMinimum(at.role, minRole)) continue;

    const key = `${at.resourceType}:${at.resourceId}`;
    const existing = results.get(key);

    if (!existing || ROLE_PRIORITY[at.role] > ROLE_PRIORITY[existing.role]) {
      results.set(key, {
        principalType,
        principalId,
        resourceType: at.resourceType,
        resourceId: at.resourceId,
        role: at.role,
        inheritedFrom: null,
      });
    }
  }

  if (!expandHierarchy) {
    return Array.from(results.values());
  }

  // Expand folder access to include contained workflows and nested folders
  const folderAccesses = Array.from(results.values()).filter(
    (ra) => ra.resourceType === 'FOLDER'
  );

  for (const folderAccess of folderAccesses) {
    // Get all descendant folders
    const descendantFolderIds = await getFolderDescendants(folderAccess.resourceId);

    // Add descendant folders as inherited access
    if (!resourceType || resourceType === 'FOLDER') {
      for (const folderId of descendantFolderIds) {
        const key = `folder:${folderId}`;
        const existing = results.get(key);

        if (
          (!existing || ROLE_PRIORITY[folderAccess.role] > ROLE_PRIORITY[existing.role]) &&
          (!minRole || roleMeetsMinimum(folderAccess.role, minRole))
        ) {
          results.set(key, {
            principalType,
            principalId,
            resourceType: 'FOLDER',
            resourceId: folderId,
            role: folderAccess.role,
            inheritedFrom: folderAccess.resourceId,
          });
        }
      }
    }

    // Get workflows in the folder and all descendant folders
    if (!resourceType || resourceType === 'WORKFLOW') {
      const allFolderIds = [folderAccess.resourceId, ...descendantFolderIds];

      const workflowsInFolders = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(inArray(workflows.parentFolderId, allFolderIds));

      for (const workflow of workflowsInFolders) {
        const key = `workflow:${workflow.id}`;
        const existing = results.get(key);

        if (
          (!existing || ROLE_PRIORITY[folderAccess.role] > ROLE_PRIORITY[existing.role]) &&
          (!minRole || roleMeetsMinimum(folderAccess.role, minRole))
        ) {
          results.set(key, {
            principalType,
            principalId,
            resourceType: 'WORKFLOW',
            resourceId: workflow.id,
            role: folderAccess.role,
            inheritedFrom: folderAccess.resourceId,
          });
        }
      }
    }
  }

  return Array.from(results.values());
}

/**
 * Get all principals that have access to a resource.
 * For workflows/folders: also considers inherited access through parent folder hierarchy.
 */
export async function getResourcePrincipals(
  resourceType: ResourceType,
  resourceId: string,
  options: {
    principalType?: PrincipalType;
    minRole?: AccessRole;
  } = {}
): Promise<ResolvedAccess[]> {
  const db = getDb();
  const { principalType, minRole } = options;

  const results = new Map<string, ResolvedAccess>();

  // Direct access to this resource
  const directQuery = db
    .select()
    .from(providerAccess)
    .where(
      and(eq(providerAccess.resourceType, resourceType), eq(providerAccess.resourceId, resourceId))
    );

  const directAccess = await directQuery;

  for (const at of directAccess) {
    if (principalType && at.principleType !== principalType) continue;
    if (minRole && !roleMeetsMinimum(at.role, minRole)) continue;

    const key = `${at.principleType}:${at.principleId}`;
    const existing = results.get(key);

    if (!existing || ROLE_PRIORITY[at.role] > ROLE_PRIORITY[existing.role]) {
      results.set(key, {
        principalType: at.principleType,
        principalId: at.principleId,
        resourceType,
        resourceId,
        role: at.role,
        inheritedFrom: null,
      });
    }
  }

  // For workflows: check access via parent folder hierarchy
  if (resourceType === 'WORKFLOW') {
    const [workflow] = await db
      .select({ parentFolderId: workflows.parentFolderId })
      .from(workflows)
      .where(eq(workflows.id, resourceId))
      .limit(1);

    if (workflow?.parentFolderId) {
      const ancestorFolderIds = [
        workflow.parentFolderId,
        ...(await getFolderAncestors(workflow.parentFolderId)),
      ];

      const folderAccess = await db
        .select()
        .from(providerAccess)
        .where(
          and(
            eq(providerAccess.resourceType, 'FOLDER'),
            inArray(providerAccess.resourceId, ancestorFolderIds)
          )
        );

      for (const at of folderAccess) {
        if (principalType && at.principleType !== principalType) continue;
        if (minRole && !roleMeetsMinimum(at.role, minRole)) continue;

        const key = `${at.principleType}:${at.principleId}`;
        const existing = results.get(key);

        if (!existing || ROLE_PRIORITY[at.role] > ROLE_PRIORITY[existing.role]) {
          results.set(key, {
            principalType: at.principleType,
            principalId: at.principleId,
            resourceType,
            resourceId,
            role: at.role,
            inheritedFrom: at.resourceId,
          });
        }
      }
    }
  }

  // For folders: check access via parent folder hierarchy
  if (resourceType === 'FOLDER') {
    const ancestorFolderIds = await getFolderAncestors(resourceId);

    if (ancestorFolderIds.length > 0) {
      const folderAccess = await db
        .select()
        .from(providerAccess)
        .where(
          and(
            eq(providerAccess.resourceType, 'FOLDER'),
            inArray(providerAccess.resourceId, ancestorFolderIds)
          )
        );

      for (const at of folderAccess) {
        if (principalType && at.principleType !== principalType) continue;
        if (minRole && !roleMeetsMinimum(at.role, minRole)) continue;

        const key = `${at.principleType}:${at.principleId}`;
        const existing = results.get(key);

        if (!existing || ROLE_PRIORITY[at.role] > ROLE_PRIORITY[existing.role]) {
          results.set(key, {
            principalType: at.principleType,
            principalId: at.principleId,
            resourceType,
            resourceId,
            role: at.role,
            inheritedFrom: at.resourceId,
          });
        }
      }
    }
  }

  return Array.from(results.values());
}

/**
 * Get the effective role for principal->resource, combining:
 * - Direct access
 * - Inherited access via folder hierarchy
 * Returns highest role or null if no access.
 */
export async function getResolvedAccess(
  principalType: PrincipalType,
  principalId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<AccessRole | null> {
  const db = getDb();
  let highestRole: AccessRole | null = null;

  // Check direct access
  const [directAccess] = await db
    .select()
    .from(providerAccess)
    .where(
      and(
        eq(providerAccess.principleType, principalType),
        eq(providerAccess.principleId, principalId),
        eq(providerAccess.resourceType, resourceType),
        eq(providerAccess.resourceId, resourceId)
      )
    )
    .limit(1);

  if (directAccess) {
    highestRole = directAccess.role;
  }

  // For workflows: check access via parent folder hierarchy
  if (resourceType === 'WORKFLOW') {
    const [workflow] = await db
      .select({ parentFolderId: workflows.parentFolderId })
      .from(workflows)
      .where(eq(workflows.id, resourceId))
      .limit(1);

    if (workflow?.parentFolderId) {
      const ancestorFolderIds = [
        workflow.parentFolderId,
        ...(await getFolderAncestors(workflow.parentFolderId)),
      ];

      const folderRoles = await db
        .select({ role: providerAccess.role })
        .from(providerAccess)
        .where(
          and(
            eq(providerAccess.principleType, principalType),
            eq(providerAccess.principleId, principalId),
            eq(providerAccess.resourceType, 'FOLDER'),
            inArray(providerAccess.resourceId, ancestorFolderIds)
          )
        );

      for (const { role } of folderRoles) {
        if (highestRole === null || ROLE_PRIORITY[role] > ROLE_PRIORITY[highestRole]) {
          highestRole = role;
        }
      }
    }
  }

  // For folders: check access via parent folder hierarchy
  if (resourceType === 'FOLDER') {
    const ancestorFolderIds = await getFolderAncestors(resourceId);

    if (ancestorFolderIds.length > 0) {
      const folderRoles = await db
        .select({ role: providerAccess.role })
        .from(providerAccess)
        .where(
          and(
            eq(providerAccess.principleType, principalType),
            eq(providerAccess.principleId, principalId),
            eq(providerAccess.resourceType, 'FOLDER'),
            inArray(providerAccess.resourceId, ancestorFolderIds)
          )
        );

      for (const { role } of folderRoles) {
        if (highestRole === null || ROLE_PRIORITY[role] > ROLE_PRIORITY[highestRole]) {
          highestRole = role;
        }
      }
    }
  }

  return highestRole;
}

/**
 * Grant access to a resource for a principal
 */
export async function grantAccess(
  principalType: PrincipalType,
  principalId: string,
  resourceType: ResourceType,
  resourceId: string,
  role: AccessRole
): Promise<ProviderAccessRecord> {
  const db = getDb();

  const [record] = await db
    .insert(providerAccess)
    .values({
      principleType: principalType,
      principleId: principalId,
      resourceType: resourceType,
      resourceId: resourceId,
      role: role,
    })
    .onConflictDoUpdate({
      target: [
        providerAccess.principleType,
        providerAccess.principleId,
        providerAccess.resourceType,
        providerAccess.resourceId,
      ],
      set: { role },
    })
    .returning();

  return record;
}

/**
 * Revoke access to a resource for a principal
 */
export async function revokeAccess(
  principalType: PrincipalType,
  principalId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> {
  const db = getDb();

  await db
    .delete(providerAccess)
    .where(
      and(
        eq(providerAccess.principleType, principalType),
        eq(providerAccess.principleId, principalId),
        eq(providerAccess.resourceType, resourceType),
        eq(providerAccess.resourceId, resourceId)
      )
    );

  return true;
}
