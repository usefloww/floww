/**
 * AWS Lambda Runtime Implementation
 *
 * Executes workflows using AWS Lambda.
 */

import type { LambdaClient } from '@aws-sdk/client-lambda';
import {
  BaseRuntime,
  type RuntimeConfig,
  type RuntimeCreationStatus,
  type RuntimePayload,
  type UserCode,
  type DefinitionsResult,
} from '../runtime-types';
import {
  deployLambdaFunction,
  getLambdaDeployStatus,
  invokeLambdaAsync,
  invokeLambdaSync,
  deleteLambdaFunction,
  isLambdaHealthy,
} from '../utils/aws-lambda';

export interface LambdaRuntimeConfig {
  lambdaClient: LambdaClient;
  executionRoleArn: string;
  registryUrl: string;
  repositoryName: string;
  backendUrl: string;
}

export class LambdaRuntime extends BaseRuntime {
  readonly type = 'lambda' as const;

  private lambdaClient: LambdaClient;
  private executionRoleArn: string;
  private registryUrl: string;
  private repositoryName: string;
  private backendUrl: string;

  constructor(config: LambdaRuntimeConfig) {
    super();
    this.lambdaClient = config.lambdaClient;
    this.executionRoleArn = config.executionRoleArn;
    this.registryUrl = config.registryUrl;
    this.repositoryName = config.repositoryName;
    this.backendUrl = config.backendUrl;
  }

  private getImageUri(imageDigest: string): string {
    // Check if image_digest is already a full URI (for default runtimes)
    // or just a digest (for regular runtimes)
    if (imageDigest.includes('/')) {
      return imageDigest;
    }

    // Construct full ECR image URI for Lambda
    let registryHost = this.registryUrl;
    if (registryHost.includes('/')) {
      registryHost = registryHost.split('/')[0];
    }

    return `${registryHost}/${this.repositoryName}@${imageDigest}`;
  }

  async createRuntime(config: RuntimeConfig): Promise<RuntimeCreationStatus> {
    this.log('Creating Lambda runtime', { runtimeId: config.runtimeId });

    const imageUri = this.getImageUri(config.imageDigest);

    await deployLambdaFunction(this.lambdaClient, {
      runtimeId: config.runtimeId,
      imageUri,
      executionRoleArn: this.executionRoleArn,
      backendUrl: this.backendUrl,
    });

    return {
      status: 'IN_PROGRESS',
      newLogs: [
        {
          timestamp: new Date().toISOString(),
          message: 'Lambda deployment initiated',
          level: 'info',
        },
      ],
    };
  }

  async getRuntimeStatus(runtimeId: string): Promise<RuntimeCreationStatus> {
    const status = await getLambdaDeployStatus(this.lambdaClient, runtimeId);

    return {
      status: status.status,
      newLogs: [
        {
          timestamp: new Date().toISOString(),
          message: status.logs ?? `Lambda state: ${status.lambdaState ?? 'unknown'}`,
        },
      ],
    };
  }

  async invokeTrigger(
    triggerId: string,
    runtimeConfig: RuntimeConfig,
    userCode: UserCode,
    payload: RuntimePayload
  ): Promise<void> {
    this.log('Invoking Lambda trigger', { triggerId, runtimeId: runtimeConfig.runtimeId });

    const eventPayload = {
      type: 'invoke_trigger',
      userCode,
      ...payload,
    };

    await invokeLambdaAsync(this.lambdaClient, runtimeConfig.runtimeId, eventPayload);
  }

  async getDefinitions(
    runtimeConfig: RuntimeConfig,
    userCode: UserCode,
    providerConfigs: Record<string, unknown>
  ): Promise<DefinitionsResult> {
    this.log('Getting definitions from Lambda', { runtimeId: runtimeConfig.runtimeId });

    const eventPayload = {
      type: 'get_definitions',
      userCode,
      providerConfigs,
    };

    const result = await invokeLambdaSync(
      this.lambdaClient,
      runtimeConfig.runtimeId,
      eventPayload
    );

    return result as unknown as DefinitionsResult;
  }

  async destroyRuntime(config: RuntimeConfig): Promise<void> {
    this.log('Destroying Lambda runtime', { runtimeId: config.runtimeId });
    await deleteLambdaFunction(this.lambdaClient, config.runtimeId);
  }

  async isHealthy(config: RuntimeConfig): Promise<boolean> {
    return isLambdaHealthy(this.lambdaClient, config.runtimeId);
  }

  async teardownUnusedRuntimes(): Promise<void> {
    // Lambda functions are managed via deployments, not cleaned up automatically
    // This is intentionally a no-op
  }
}
