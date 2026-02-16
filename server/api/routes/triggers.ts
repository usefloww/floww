/**
 * Trigger Routes
 *
 * GET /api/triggers - List triggers for a workflow
 * POST /api/triggers/sync - Sync triggers from metadata
 * POST /api/triggers/:id/execute - Execute trigger manually
 */

import { get, post, json, errorResponse, parseBody } from '~/server/api/router';
import * as triggerService from '~/server/services/trigger-service';
import { hasWorkflowAccess } from '~/server/services/access-service';
import { createExecution } from '~/server/services/execution-service';
import { executeManualTrigger } from '~/server/services/trigger-execution-service';
import { syncTriggersSchema, executeTriggerSchema } from '~/server/api/schemas';
import * as workflowService from '~/server/services/workflow-service';

// List triggers for a workflow
get('/triggers', async (ctx) => {
  const { user, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const workflowId = query.get('workflowId');
  if (!workflowId) {
    return errorResponse('workflowId is required', 400);
  }

  // Verify workflow exists
  const workflow = await workflowService.getWorkflow(workflowId);
  if (!workflow) {
    return errorResponse('Workflow not found', 404);
  }

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const triggers = await triggerService.listTriggers(workflowId);

  return json({
    results: triggers.map((t) => ({
      id: t.id,
      workflowId: t.workflowId,
      providerId: t.providerId,
      triggerType: t.triggerType,
      input: t.input,
      state: t.state,
    })),
  });
});

// Sync triggers from metadata
post('/triggers/sync', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, syncTriggersSchema);
  if ('error' in parsed) return parsed.error;

  const { workflowId, namespaceId, triggers: triggersMetadata, providerMappings } = parsed.data;

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  try {
    // Cast to TriggerMetadata[] - the schema validates the structure
    const typedTriggersMetadata = (triggersMetadata ?? []) as Parameters<typeof triggerService.syncTriggers>[2];
    const webhooks = await triggerService.syncTriggers(
      workflowId,
      namespaceId,
      typedTriggersMetadata,
      providerMappings,
    );

    return json({ webhooks });
  } catch (error) {
    if (error instanceof Error) {
      try {
        const parsedError = JSON.parse(error.message);
        return json(parsedError, 400);
      } catch {
        return errorResponse(error.message, 400);
      }
    }
    throw error;
  }
});

// Execute trigger manually
post('/triggers/:triggerId/execute', async (ctx) => {
  const { user, params, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const trigger = await triggerService.getTrigger(params.triggerId);
  if (!trigger) {
    return errorResponse('Trigger not found', 404);
  }

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, trigger.workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const parsed = await parseBody(request, executeTriggerSchema);
  const data: Record<string, unknown> = 'error' in parsed
    ? {}
    : (parsed.data.data as Record<string, unknown>) ?? {};

  // Create execution record
  const execution = await createExecution({
    workflowId: trigger.workflowId,
    triggerId: trigger.id,
    triggeredByUserId: user.id,
  });

  // Execute trigger
  const result = await executeManualTrigger(trigger.id, data, execution.id);

  return json({
    executionId: execution.id,
    status: result.status,
  }, 201);
});

// Webhook endpoint (public, no auth)
post('/webhooks/:triggerId', async (ctx) => {
  const { params, request } = ctx;

  // Get trigger by webhook path
  const webhookPath = `/webhook/${params.triggerId}`;
  const trigger = await triggerService.getTriggerByWebhookPath(webhookPath);

  if (!trigger) {
    return errorResponse('Webhook not found', 404);
  }

  // Create execution record (no user)
  const execution = await createExecution({
    workflowId: trigger.workflowId,
    triggerId: trigger.id,
  });

  // Parse body
  let body: unknown = {};
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      body = await request.text();
    }
  } catch {
    body = {};
  }

  // Import and execute
  const { executeWebhookTrigger } = await import('~/server/services/trigger-execution-service');
  
  const url = new URL(request.url);
  const result = await executeWebhookTrigger(
    trigger.id,
    {
      method: request.method,
      path: url.pathname,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      query: Object.fromEntries(url.searchParams.entries()),
    },
    execution.id
  );

  return json({
    executionId: execution.id,
    status: result.status,
  });
}, false); // No auth required
