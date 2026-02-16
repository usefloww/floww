/**
 * AWS Lambda utilities for runtime execution.
 *
 * This module provides functions to manage AWS Lambda functions for user code execution.
 */

import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
  DeleteFunctionCommand,
  type FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import { logger } from '~/server/utils/logger';

const FUNCTION_NAME_PREFIX = 'floww-runtime-';

function getFunctionName(runtimeId: string): string {
  return `${FUNCTION_NAME_PREFIX}${runtimeId}`;
}

export interface DeployLambdaOptions {
  runtimeId: string;
  imageUri: string;
  executionRoleArn: string;
  backendUrl?: string;
  memorySize?: number;
  timeout?: number;
}

export async function deployLambdaFunction(
  client: LambdaClient,
  options: DeployLambdaOptions
): Promise<void> {
  const { runtimeId, imageUri, executionRoleArn, backendUrl, memorySize = 512, timeout = 30 } = options;
  const functionName = getFunctionName(runtimeId);

  const environment = backendUrl
    ? { Variables: { BACKEND_URL: backendUrl } }
    : undefined;

  await client.send(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: executionRoleArn,
      Code: { ImageUri: imageUri },
      PackageType: 'Image',
      Timeout: timeout,
      MemorySize: memorySize,
      Publish: true,
      ...(environment ? { Environment: environment } : {}),
    })
  );

  logger.info('Created Lambda function', { functionName, imageUri, backendUrl });
}

export interface LambdaDeployStatus {
  success: boolean;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  lambdaState?: string;
  lastUpdateStatus?: string;
  logs?: string;
}

export async function getLambdaDeployStatus(
  client: LambdaClient,
  runtimeId: string
): Promise<LambdaDeployStatus> {
  const functionName = getFunctionName(runtimeId);

  try {
    const response = await client.send(
      new GetFunctionCommand({ FunctionName: functionName })
    );
    const conf: FunctionConfiguration = response.Configuration ?? {};

    const state = conf.State;
    const updateStatus = conf.LastUpdateStatus;

    let status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    if (state === 'Active' && updateStatus === 'Successful') {
      status = 'COMPLETED';
    } else if (updateStatus === 'Failed') {
      status = 'FAILED';
    } else if (state === 'Pending' || state === 'Inactive' || updateStatus === 'InProgress') {
      status = 'IN_PROGRESS';
    } else {
      status = 'IN_PROGRESS';
    }

    return {
      success: true,
      status,
      lambdaState: state,
      lastUpdateStatus: updateStatus,
      logs: conf.LastUpdateStatusReason ?? conf.StateReason ?? undefined,
    };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    if (err.name === 'ResourceNotFoundException') {
      return {
        success: false,
        status: 'FAILED',
        logs: 'Function not found',
      };
    }
    return {
      success: false,
      status: 'FAILED',
      logs: err.message ?? String(error),
    };
  }
}

export interface LambdaInvokeResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function invokeLambdaAsync(
  client: LambdaClient,
  runtimeId: string,
  eventPayload: Record<string, unknown>
): Promise<LambdaInvokeResult> {
  const functionName = getFunctionName(runtimeId);

  try {
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event', // Async invocation
        Payload: Buffer.from(JSON.stringify(eventPayload)),
      })
    );

    logger.debug('Lambda invoked asynchronously', { functionName, statusCode: response.StatusCode });

    return {
      success: true,
      statusCode: response.StatusCode,
    };
  } catch (error) {
    const err = error as { message?: string };
    logger.error('Failed to invoke Lambda', { functionName, error: err.message ?? String(error) });
    return {
      success: false,
      error: err.message ?? String(error),
    };
  }
}

export async function invokeLambdaSync(
  client: LambdaClient,
  runtimeId: string,
  eventPayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const functionName = getFunctionName(runtimeId);

  try {
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse', // Synchronous invocation
        Payload: Buffer.from(JSON.stringify(eventPayload)),
      })
    );

    const payloadBytes = response.Payload;
    if (!payloadBytes) {
      throw new Error('No payload returned from Lambda');
    }

    const resultStr = new TextDecoder().decode(payloadBytes);
    const result = JSON.parse(resultStr) as Record<string, unknown>;

    logger.debug('Lambda invoked synchronously', { functionName, statusCode: response.StatusCode });

    // Lambda may wrap the response - check for body field
    if (typeof result === 'object' && result !== null && 'body' in result) {
      const body = result.body;
      if (typeof body === 'string') {
        return JSON.parse(body) as Record<string, unknown>;
      }
    }

    return result;
  } catch (error) {
    logger.error('Failed to invoke Lambda synchronously', { functionName, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function deleteLambdaFunction(
  client: LambdaClient,
  runtimeId: string
): Promise<void> {
  const functionName = getFunctionName(runtimeId);

  try {
    await client.send(
      new DeleteFunctionCommand({ FunctionName: functionName })
    );
    logger.info('Deleted Lambda function', { functionName });
  } catch (error) {
    const err = error as { name?: string };
    if (err.name === 'ResourceNotFoundException') {
      logger.debug('Lambda function not found, nothing to delete', { functionName });
      return;
    }
    throw error;
  }
}

export async function isLambdaHealthy(
  client: LambdaClient,
  runtimeId: string
): Promise<boolean> {
  const status = await getLambdaDeployStatus(client, runtimeId);
  return status.success && status.status === 'COMPLETED';
}
