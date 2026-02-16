/**
 * Config Route
 *
 * GET /api/config - Public configuration for the frontend
 */

import { get, json } from '~/server/api/router';
import { settings } from '~/server/settings';
import { getEnvWithSecret } from '~/server/utils/docker-secrets';

get('/config', async () => {
  return json({
    auth: {
      type: settings.auth.AUTH_TYPE,
      enabled: settings.auth.AUTH_TYPE !== 'none',
    },
    features: {
      billing: settings.general.IS_CLOUD,
      singleOrg: settings.general.SINGLE_ORG_MODE,
      aiBuilder: settings.general.ENABLE_AI_BUILDER,
    },
    limits: {
      maxWorkflows: parseInt(getEnvWithSecret('MAX_WORKFLOWS') ?? '100', 10),
      maxExecutionsPerMonth: parseInt(getEnvWithSecret('MAX_EXECUTIONS_PER_MONTH') ?? '10000', 10),
    },
    version: settings.version.VERSION,
  });
}, false); // No auth required
