/**
 * Centrifugo Routes
 *
 * POST /centrifugo/connect - Generate connection token
 * POST /centrifugo/subscribe - Generate subscription token
 */

import { post, json, errorResponse, parseBody } from '~/server/api/router';
import { centrifugoConnectSchema, centrifugoSubscribeSchema } from '~/server/api/schemas';
import { hasWorkflowAccess, hasNamespaceAccess } from '~/server/services/access-service';
import { getExecution } from '~/server/services/execution-service';

// Centrifugo connect proxy — authenticates user and returns their ID
post('/centrifugo/connect', async ({ user, request }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, centrifugoConnectSchema);
  if ('error' in parsed) return parsed.error;

  return json({
    result: {
      user: user.id,
      expire_at: Math.floor(Date.now() / 1000) + 3600,
    },
  });
});

// Generate subscription token for a channel
post('/centrifugo/subscribe', async ({ user, request }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, centrifugoSubscribeSchema);
  if ('error' in parsed) return parsed.error;

  const { channel } = parsed.data;

  // Validate channel access based on channel type
  // Format: workflow:${workflowId}, execution:${executionId}, namespace:${namespaceId}, user:${userId}
  const [channelType, channelId] = channel.split(':');

  if (!channelType || !channelId) {
    return errorResponse('Invalid channel format', 400);
  }

  // Validate access based on channel type
  let hasAccess = false;

  switch (channelType) {
    case 'workflow':
      hasAccess = await hasWorkflowAccess(user.id, channelId);
      break;

    case 'execution': {
      // Look up the execution's workflow and validate access to that
      const execution = await getExecution(channelId);
      if (execution) {
        hasAccess = await hasWorkflowAccess(user.id, execution.workflowId);
      }
      break;
    }

    case 'namespace':
      hasAccess = await hasNamespaceAccess(user.id, channelId);
      break;

    case 'user':
      // Users can only subscribe to their own user channel
      hasAccess = channelId === user.id;
      break;

    default:
      // Unknown channel type - deny access
      return errorResponse('Unknown channel type', 400);
  }

  if (!hasAccess) {
    return json({ error: { code: 403, message: 'Access denied to channel' } });
  }

  return json({
    result: {
      expire_at: Math.floor(Date.now() / 1000) + 3600,
    },
  });
});
