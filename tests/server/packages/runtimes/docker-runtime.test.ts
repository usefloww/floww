import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerRuntime } from '~/server/packages/runtimes/implementations/docker-runtime';
import type { RuntimeConfig, UserCode, RuntimePayload } from '~/server/packages/runtimes/runtime-types';

// Mock the docker utils module
vi.mock('~/server/packages/runtimes/utils/docker', () => ({
  createContainer: vi.fn(),
  getContainerStatus: vi.fn(),
  startContainerIfStopped: vi.fn(),
  sendWebhookToContainer: vi.fn(),
  cleanupIdleContainers: vi.fn(),
  removeContainer: vi.fn(),
}));

import * as dockerUtils from '~/server/packages/runtimes/utils/docker';

const mockedDockerUtils = vi.mocked(dockerUtils);

describe('DockerRuntime', () => {
  let runtime: DockerRuntime;
  const testConfig: RuntimeConfig = {
    runtimeId: 'test-runtime-123',
    imageDigest: 'sha256:abc123def456',
  };

  const testUserCode: UserCode = {
    files: {
      'main.ts': `
        import { Builtin } from "floww";
        const builtin = new Builtin();
        builtin.triggers.onCron({
          expression: "*/10 * * * *",
          handler: async (ctx, event) => {
            console.log("Hello, world!");
          },
        });
      `,
    },
    entrypoint: 'main.ts',
  };

  const testPayload: RuntimePayload = {
    trigger: {
      provider: { type: 'builtin', alias: 'default' },
      triggerType: 'onCron',
      input: { expression: '*/10 * * * *' },
    },
    data: {},
    authToken: 'test-token',
    executionId: 'exec-123',
    providerConfigs: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new DockerRuntime({
      repositoryName: 'docker-runtime',
      registryUrl: 'ghcr.io/usefloww',
    });
  });

  describe('createRuntime', () => {
    it('should create container and return IN_PROGRESS status', async () => {
      mockedDockerUtils.createContainer.mockResolvedValue();

      const result = await runtime.createRuntime(testConfig);

      expect(result.status).toBe('IN_PROGRESS');
      expect(result.newLogs).toHaveLength(1);
      expect(result.newLogs[0].message).toBe('Container creation initiated');
      expect(result.newLogs[0].level).toBe('info');

      expect(mockedDockerUtils.createContainer).toHaveBeenCalledWith(
        'test-runtime-123',
        'ghcr.io/usefloww/docker-runtime@sha256:abc123def456'
      );
    });

    it('should use full image URI if already provided', async () => {
      mockedDockerUtils.createContainer.mockResolvedValue();

      const configWithFullUri: RuntimeConfig = {
        runtimeId: 'test-runtime',
        imageDigest: 'ghcr.io/usefloww/docker-runtime:latest',
      };

      await runtime.createRuntime(configWithFullUri);

      expect(mockedDockerUtils.createContainer).toHaveBeenCalledWith(
        'test-runtime',
        'ghcr.io/usefloww/docker-runtime:latest'
      );
    });
  });

  describe('getRuntimeStatus', () => {
    it('should return COMPLETED when container is healthy', async () => {
      mockedDockerUtils.getContainerStatus.mockResolvedValue({
        status: 'COMPLETED',
        logs: 'Container is ready to accept requests',
      });

      const result = await runtime.getRuntimeStatus('test-runtime-123');

      expect(result.status).toBe('COMPLETED');
      expect(result.newLogs[0].message).toBe('Container is ready to accept requests');
    });

    it('should return IN_PROGRESS when container is still starting', async () => {
      mockedDockerUtils.getContainerStatus.mockResolvedValue({
        status: 'IN_PROGRESS',
        logs: 'Waiting for container to be healthy',
      });

      const result = await runtime.getRuntimeStatus('test-runtime-123');

      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should return FAILED when container does not exist', async () => {
      mockedDockerUtils.getContainerStatus.mockResolvedValue({
        status: 'FAILED',
        logs: 'Container not found: floww-runtime-test-runtime-123',
      });

      const result = await runtime.getRuntimeStatus('test-runtime-123');

      expect(result.status).toBe('FAILED');
    });
  });

  describe('invokeTrigger', () => {
    it('should start container if stopped and send webhook', async () => {
      mockedDockerUtils.startContainerIfStopped.mockResolvedValue();
      mockedDockerUtils.sendWebhookToContainer.mockResolvedValue({ success: true });

      await runtime.invokeTrigger('trigger-1', testConfig, testUserCode, testPayload);

      expect(mockedDockerUtils.startContainerIfStopped).toHaveBeenCalledWith('test-runtime-123');
      expect(mockedDockerUtils.sendWebhookToContainer).toHaveBeenCalledWith(
        'test-runtime-123',
        expect.objectContaining({
          type: 'invoke_trigger',
          userCode: testUserCode,
          trigger: testPayload.trigger,
          data: testPayload.data,
          authToken: testPayload.authToken,
          executionId: testPayload.executionId,
        }),
        60
      );
    });
  });

  describe('getDefinitions', () => {
    it('should return definitions from container', async () => {
      const expectedDefinitions = {
        success: true,
        triggers: [
          {
            provider: { type: 'builtin', alias: 'default' },
            triggerType: 'onCron',
            input: { expression: '*/10 * * * *' },
          },
        ],
        providers: [{ type: 'builtin', alias: 'default' }],
      };

      mockedDockerUtils.startContainerIfStopped.mockResolvedValue();
      mockedDockerUtils.sendWebhookToContainer.mockResolvedValue(expectedDefinitions);

      const result = await runtime.getDefinitions(testConfig, testUserCode, {});

      expect(result).toEqual(expectedDefinitions);
      expect(mockedDockerUtils.sendWebhookToContainer).toHaveBeenCalledWith(
        'test-runtime-123',
        expect.objectContaining({
          type: 'get_definitions',
          userCode: testUserCode,
          providerConfigs: {},
        }),
        30
      );
    });
  });

  describe('destroyRuntime', () => {
    it('should remove container', async () => {
      mockedDockerUtils.removeContainer.mockResolvedValue(true);

      await runtime.destroyRuntime(testConfig);

      expect(mockedDockerUtils.removeContainer).toHaveBeenCalledWith('test-runtime-123');
    });
  });

  describe('isHealthy', () => {
    it('should return true when container status is COMPLETED', async () => {
      mockedDockerUtils.getContainerStatus.mockResolvedValue({
        status: 'COMPLETED',
        logs: 'Container is ready',
      });

      const result = await runtime.isHealthy(testConfig);

      expect(result).toBe(true);
    });

    it('should return false when container status is not COMPLETED', async () => {
      mockedDockerUtils.getContainerStatus.mockResolvedValue({
        status: 'IN_PROGRESS',
        logs: 'Still starting',
      });

      const result = await runtime.isHealthy(testConfig);

      expect(result).toBe(false);
    });
  });

  describe('teardownUnusedRuntimes', () => {
    it('should call cleanupIdleContainers with 300 seconds timeout', async () => {
      mockedDockerUtils.cleanupIdleContainers.mockResolvedValue();

      await runtime.teardownUnusedRuntimes();

      expect(mockedDockerUtils.cleanupIdleContainers).toHaveBeenCalledWith(300);
    });
  });
});
