import { z } from 'zod';

// ============================================================================
// Request schemas (migrated from server/api/schemas.ts)
// ============================================================================

export const deviceTokenSchema = z.object({
  deviceCode: z.string().min(1),
  grantType: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// Request schemas (from server/api/schemas.ts -- centrifugo)
// ============================================================================

export const centrifugoConnectSchema = z.object({
  client: z.string().optional(),
});

export const centrifugoSubscribeSchema = z.object({
  channel: z.string().min(1),
});

// ============================================================================
// Inferred types
// ============================================================================

export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CentrifugoConnectInput = z.infer<typeof centrifugoConnectSchema>;
export type CentrifugoSubscribeInput = z.infer<typeof centrifugoSubscribeSchema>;
