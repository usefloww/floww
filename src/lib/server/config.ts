import { createServerFn } from '@tanstack/react-start';
import { settings } from '~/server/settings';
import { getEnvWithSecret } from '~/server/utils/docker-secrets';

export interface AppConfig {
  auth: {
    type: string;
    enabled: boolean;
  };
  features: {
    billing: boolean;
    singleOrg: boolean;
  };
  limits: {
    maxWorkflows: number;
    maxExecutionsPerMonth: number;
  };
  version: string;
}

/**
 * Server function to get public configuration
 * This doesn't require authentication
 */
export const getConfig = createServerFn({ method: 'GET' }).handler(async (): Promise<AppConfig> => {
  return {
    auth: {
      type: settings.auth.AUTH_TYPE,
      enabled: settings.auth.AUTH_TYPE !== 'none',
    },
    features: {
      billing: settings.general.IS_CLOUD,
      singleOrg: settings.general.SINGLE_ORG_MODE,
    },
    limits: {
      maxWorkflows: parseInt(getEnvWithSecret('MAX_WORKFLOWS') ?? '100', 10),
      maxExecutionsPerMonth: parseInt(getEnvWithSecret('MAX_EXECUTIONS_PER_MONTH') ?? '10000', 10),
    },
    version: process.env.npm_package_version ?? '0.0.0',
  };
});

/**
 * Helper to check if billing features are enabled
 */
export const isBillingEnabled = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => {
  return settings.general.IS_CLOUD;
});
