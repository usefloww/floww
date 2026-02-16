/**
 * Internal providers that are auto-created and should not be visible
 * in user-facing provider lists, configuration UIs, or management pages.
 *
 * These providers represent core platform features rather than
 * third-party integrations.
 */
export const INTERNAL_PROVIDERS = ['builtin', 'kvstore'] as const;

export type InternalProvider = (typeof INTERNAL_PROVIDERS)[number];

/**
 * Check if a provider type is internal (auto-created, hidden from UI)
 */
export function isInternalProvider(providerType: string): boolean {
  return INTERNAL_PROVIDERS.includes(providerType as InternalProvider);
}
