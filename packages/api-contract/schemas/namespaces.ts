import { z } from 'zod';

// ============================================================================
// Response schemas (from src/types/api.ts)
// ============================================================================

export const namespaceSchema = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
  }).optional(),
  organization: z.object({
    id: z.string(),
    displayName: z.string(),
  }).optional(),
});

// User from whoami endpoint
export const userSchema = z.object({
  id: z.string(),
  workosUserId: z.string().nullable(),
  userType: z.enum(['HUMAN', 'SERVICE_ACCOUNT']),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  isAdmin: z.boolean(),
  createdAt: z.string().nullable(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type Namespace = z.infer<typeof namespaceSchema>;
export type User = z.infer<typeof userSchema>;
