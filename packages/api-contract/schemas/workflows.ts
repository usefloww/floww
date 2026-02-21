import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const createWorkflowSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  parentFolderId: z.string().optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  parentFolderId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  triggersMetadata: z.unknown().optional(),
});

export const importN8nWorkflowSchema = z.object({
  namespaceId: z.string().min(1),
  n8nWorkflow: z.unknown(),
  name: z.string().optional(),
});

// ============================================================================
// Response schemas (from src/types/api.ts)
// ============================================================================

export const createdByUserSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  namespaceId: z.string(),
  parentFolderId: z.string().nullable().optional(),
  createdById: z.string(),
  createdBy: createdByUserSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  active: z.boolean().nullable().optional(),
  lastDeployment: z.object({
    deployedAt: z.string(),
    providerDefinitions: z.array(z.object({
      type: z.string(),
      alias: z.string(),
    })).optional(),
  }).nullable().optional(),
});

// Folder schemas
export const folderSchema = z.object({
  id: z.string(),
  namespaceId: z.string(),
  name: z.string(),
  parentFolderId: z.string().nullable(),
});

export const folderWithPathSchema = folderSchema.extend({
  path: z.array(folderSchema),
});

export const createFolderSchema = z.object({
  namespaceId: z.string().min(1, 'namespaceId is required'),
  name: z.string().min(1, 'name is required'),
  parentFolderId: z.string().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().optional(),
  parentFolderId: z.string().nullable().optional(),
});

export const foldersListResponseSchema = z.object({
  results: z.array(folderSchema),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ImportN8nWorkflowInput = z.infer<typeof importN8nWorkflowSchema>;

export type CreatedByUser = z.infer<typeof createdByUserSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowCreate = CreateWorkflowInput;
export type WorkflowUpdate = UpdateWorkflowInput;

export type Folder = z.infer<typeof folderSchema>;
export type FolderWithPath = z.infer<typeof folderWithPathSchema>;
export type FolderCreate = z.infer<typeof createFolderSchema>;
export type FolderUpdate = z.infer<typeof updateFolderSchema>;
export type FoldersListResponse = z.infer<typeof foldersListResponseSchema>;
