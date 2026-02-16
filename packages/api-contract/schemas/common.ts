import { z } from 'zod';

// ============================================================================
// Generic response wrappers
// ============================================================================

export const listResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    results: z.array(itemSchema),
    total: z.number().optional(),
  });

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    size: z.number(),
  });

// ============================================================================
// Error response
// ============================================================================

export const apiErrorResponseSchema = z.object({
  detail: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
