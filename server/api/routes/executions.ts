/**
 * Execution Routes
 *
 * GET /api/executions - List executions
 * GET /api/executions/:id - Get execution
 * GET /api/executions/:id/logs - Get execution logs
 * POST /api/executions/:id/complete - Runtime completion callback
 * GET /api/executions/workflows/:workflowId - List executions for workflow
 * GET /api/executions/workflows/:workflowId/logs - Get logs for workflow
 */

import { get, post, json, errorResponse, parseBody } from '~/server/api/router';
import * as executionService from '~/server/services/execution-service';
import { hasWorkflowAccess } from '~/server/services/access-service';
import { verifyInvocationToken } from '~/server/services/workflow-auth-service';
import { completeExecutionSchema } from '~/server/api/schemas';

// List executions for a workflow
get('/executions', async (ctx) => {
  const { user, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const workflowId = query.get('workflowId');
  const limit = parseInt(query.get('limit') ?? '50', 10);
  const offset = parseInt(query.get('offset') ?? '0', 10);
  const status = query.get('status') as executionService.ExecutionStatus | null;

  if (!workflowId) {
    // Return recent executions across all accessible workflows
    const executions = await executionService.listRecentExecutions(user.id, {
      limit,
      offset,
    });

    return json({
      results: executions.map(executionService.serializeExecution),
    });
  }

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const result = await executionService.listExecutions(workflowId, {
    limit,
    offset,
    status: status ?? undefined,
  });

  return json({
    executions: result.executions.map(executionService.serializeExecution),
    total: result.total,
  });
});

// Get execution
get('/executions/:executionId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const execution = await executionService.getExecution(params.executionId);
  if (!execution) {
    return errorResponse('Execution not found', 404);
  }

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, execution.workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  return json(executionService.serializeExecution(execution));
});

// Get execution logs
get('/executions/:executionId/logs', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const execution = await executionService.getExecution(params.executionId);
  if (!execution) {
    return errorResponse('Execution not found', 404);
  }

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, execution.workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const logs = await executionService.getExecutionLogs(params.executionId);

  return json({
    results: logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      level: log.logLevel,
      message: log.message,
    })),
  });
});

// Complete execution - called by runtime (uses workflow auth token, not user auth)
post('/executions/:executionId/complete', async ({ params, request }) => {
  // Extract auth token from header
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Missing authorization token', 401);
  }

  const token = authHeader.slice(7);

  // Verify the invocation token
  const tokenPayload = await verifyInvocationToken(token);
  if (!tokenPayload) {
    return errorResponse('Invalid or expired token', 401);
  }

  // Get the execution
  const execution = await executionService.getExecution(params.executionId);
  if (!execution) {
    return errorResponse('Execution not found', 404);
  }

  // Parse body
  const parsed = await parseBody(request, completeExecutionSchema);
  if ('error' in parsed) return parsed.error;

  const { status, logs, error } = parsed.data;

  // Update execution based on status
  if (status === 'completed') {
    await executionService.updateExecutionCompleted(params.executionId, {
      logs: logs ?? [],
    });
  } else if (status === 'failed') {
    await executionService.updateExecutionFailed(
      params.executionId,
      error ?? 'Unknown error',
      { logs: logs ?? [] }
    );
  }

  return json({ success: true });
}, false); // No user auth - uses workflow token

// List executions for a specific workflow (alternative route)
get('/executions/workflows/:workflowId', async (ctx) => {
  const { user, params, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const { workflowId } = params;
  const limit = parseInt(query.get('limit') ?? '50', 10);
  const offset = parseInt(query.get('offset') ?? '0', 10);
  const status = query.get('status') as executionService.ExecutionStatus | null;

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const result = await executionService.listExecutions(workflowId, {
    limit,
    offset,
    status: status ?? undefined,
  });

  return json({
    executions: result.executions.map(executionService.serializeExecution),
    total: result.total,
  });
});

// Get all logs for a workflow's recent executions
get('/executions/workflows/:workflowId/logs', async (ctx) => {
  const { user, params, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const { workflowId } = params;
  const limit = parseInt(query.get('limit') ?? '100', 10);
  const offset = parseInt(query.get('offset') ?? '0', 10);
  const searchQuery = query.get('q') ?? undefined;
  const level = query.get('level') as executionService.LogLevel | undefined;

  // Check access
  const hasAccess = await hasWorkflowAccess(user.id, workflowId);
  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const logs = await executionService.searchExecutionLogs(workflowId, {
    searchQuery,
    level: level || undefined,
    limit,
    offset,
  });

  return json({
    results: logs.map((log) => ({
      id: log.id,
      executionId: log.executionHistoryId,
      timestamp: log.timestamp.toISOString(),
      level: log.logLevel,
      message: log.message,
    })),
  });
});
