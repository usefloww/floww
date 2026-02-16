/**
 * Docker Runtime Implementation
 *
 * Executes workflows using Docker containers.
 */

import {
  BaseRuntime,
  type RuntimeConfig,
  type RuntimeCreationStatus,
  type RuntimePayload,
  type UserCode,
  type DefinitionsResult,
} from '../runtime-types';
import {
  createContainer,
  getContainerStatus,
  startContainerIfStopped,
  sendWebhookToContainer,
  cleanupIdleContainers,
  removeContainer,
} from '../utils/docker';

export interface DockerRuntimeConfig {
  repositoryName: string;
  registryUrl: string;
}

export class DockerRuntime extends BaseRuntime {
  readonly type = 'docker' as const;

  private repositoryName: string;
  private registryUrl: string;

  constructor(config: DockerRuntimeConfig) {
    super();
    this.repositoryName = config.repositoryName;
    this.registryUrl = config.registryUrl;
  }

  private getImageUri(imageDigest: string): string {
    // Check if image_digest is already a full URI (for default runtimes)
    // or just a digest (for regular runtimes)
    if (imageDigest.includes('/')) {
      return imageDigest;
    }

    // Construct full image URI using registry URL
    const registryHost = this.registryUrl.replace(/^https?:\/\//, '');
    return `${registryHost}/${this.repositoryName}@${imageDigest}`;
  }

  async createRuntime(config: RuntimeConfig): Promise<RuntimeCreationStatus> {
    this.log('Creating Docker runtime', { runtimeId: config.runtimeId });

    const imageUri = this.getImageUri(config.imageDigest);

    await createContainer(config.runtimeId, imageUri);

    return {
      status: 'IN_PROGRESS',
      newLogs: [
        {
          timestamp: new Date().toISOString(),
          message: 'Container creation initiated',
          level: 'info',
        },
      ],
    };
  }

  async getRuntimeStatus(runtimeId: string): Promise<RuntimeCreationStatus> {
    const statusResult = await getContainerStatus(runtimeId);

    return {
      status: statusResult.status,
      newLogs: [
        {
          timestamp: new Date().toISOString(),
          message: statusResult.logs,
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
    this.log('Invoking trigger', { triggerId, runtimeId: runtimeConfig.runtimeId });

    await startContainerIfStopped(runtimeConfig.runtimeId);

    const eventPayload = {
      type: 'invoke_trigger',
      userCode,
      ...payload,
    };

    await sendWebhookToContainer(runtimeConfig.runtimeId, eventPayload, 60);
  }

  async getDefinitions(
    runtimeConfig: RuntimeConfig,
    userCode: UserCode,
    providerConfigs: Record<string, unknown>
  ): Promise<DefinitionsResult> {
    this.log('Getting definitions', { runtimeId: runtimeConfig.runtimeId });

    await startContainerIfStopped(runtimeConfig.runtimeId);

    const eventPayload = {
      type: 'get_definitions',
      userCode,
      providerConfigs,
    };

    const result = await sendWebhookToContainer(runtimeConfig.runtimeId, eventPayload, 30);
    return result as unknown as DefinitionsResult;
  }

  async destroyRuntime(config: RuntimeConfig): Promise<void> {
    this.log('Destroying Docker runtime', { runtimeId: config.runtimeId });
    await removeContainer(config.runtimeId);
  }

  async isHealthy(config: RuntimeConfig): Promise<boolean> {
    const status = await getContainerStatus(config.runtimeId);
    return status.status === 'COMPLETED';
  }

  async teardownUnusedRuntimes(): Promise<void> {
    await cleanupIdleContainers(300);
  }
}
