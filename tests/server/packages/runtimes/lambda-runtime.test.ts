import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LambdaRuntime } from '~/server/packages/runtimes/implementations/lambda-runtime';
import type { RuntimeConfig, UserCode, RuntimePayload } from '~/server/packages/runtimes/runtime-types';
import type { LambdaClient } from '@aws-sdk/client-lambda';

// Mock the lambda utils module
vi.mock('~/server/packages/runtimes/utils/aws-lambda', () => ({
  deployLambdaFunction: vi.fn(),
  getLambdaDeployStatus: vi.fn(),
  invokeLambdaAsync: vi.fn(),
  invokeLambdaSync: vi.fn(),
  deleteLambdaFunction: vi.fn(),
  isLambdaHealthy: vi.fn(),
}));

import * as lambdaUtils from '~/server/packages/runtimes/utils/aws-lambda';

const mockedLambdaUtils = vi.mocked(lambdaUtils);

describe('LambdaRuntime', () => {
  let runtime: LambdaRuntime;
  let mockLambdaClient: LambdaClient;

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
    mockLambdaClient = {} as LambdaClient;
    runtime = new LambdaRuntime({
      lambdaClient: mockLambdaClient,
      executionRoleArn: 'arn:aws:iam::123456789:role/floww-lambda-role',
      registryUrl: '123456789.dkr.ecr.us-east-1.amazonaws.com',
      repositoryName: 'floww-runtime',
      backendUrl: 'https://api.floww.io',
    });
  });

  describe('createRuntime', () => {
    it('should deploy Lambda function and return IN_PROGRESS status', async () => {
      mockedLambdaUtils.deployLambdaFunction.mockResolvedValue();

      const result = await runtime.createRuntime(testConfig);

      expect(result.status).toBe('IN_PROGRESS');
      expect(result.newLogs).toHaveLength(1);
      expect(result.newLogs[0].message).toBe('Lambda deployment initiated');
      expect(result.newLogs[0].level).toBe('info');

      expect(mockedLambdaUtils.deployLambdaFunction).toHaveBeenCalledWith(
        mockLambdaClient,
        expect.objectContaining({
          runtimeId: 'test-runtime-123',
          imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/floww-runtime@sha256:abc123def456',
          executionRoleArn: 'arn:aws:iam::123456789:role/floww-lambda-role',
          backendUrl: 'https://api.floww.io',
        })
      );
    });

    it('should use full image URI if already provided', async () => {
      mockedLambdaUtils.deployLambdaFunction.mockResolvedValue();

      const configWithFullUri: RuntimeConfig = {
        runtimeId: 'test-runtime',
        imageDigest: '123456789.dkr.ecr.us-east-1.amazonaws.com/floww-runtime:latest',
      };

      await runtime.createRuntime(configWithFullUri);

      expect(mockedLambdaUtils.deployLambdaFunction).toHaveBeenCalledWith(
        mockLambdaClient,
        expect.objectContaining({
          imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/floww-runtime:latest',
        })
      );
    });
  });

  describe('getRuntimeStatus', () => {
    it('should return COMPLETED when Lambda is active', async () => {
      mockedLambdaUtils.getLambdaDeployStatus.mockResolvedValue({
        success: true,
        status: 'COMPLETED',
        lambdaState: 'Active',
        lastUpdateStatus: 'Successful',
      });

      const result = await runtime.getRuntimeStatus('test-runtime-123');

      expect(result.status).toBe('COMPLETED');
    });

    it('should return IN_PROGRESS when Lambda is pending', async () => {
      mockedLambdaUtils.getLambdaDeployStatus.mockResolvedValue({
        success: true,
        status: 'IN_PROGRESS',
        lambdaState: 'Pending',
        lastUpdateStatus: 'InProgress',
      });

      const result = await runtime.getRuntimeStatus('test-runtime-123');

      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should return FAILED when Lambda deployment failed', async () => {
      mockedLambdaUtils.getLambdaDeployStatus.mockResolvedValue({
        success: false,
        status: 'FAILED',
        logs: 'Function not found',
      });

      const result = await runtime.getRuntimeStatus('test-runtime-123');

      expect(result.status).toBe('FAILED');
    });
  });

  describe('invokeTrigger', () => {
    it('should invoke Lambda asynchronously', async () => {
      mockedLambdaUtils.invokeLambdaAsync.mockResolvedValue({
        success: true,
        statusCode: 202,
      });

      await runtime.invokeTrigger('trigger-1', testConfig, testUserCode, testPayload);

      expect(mockedLambdaUtils.invokeLambdaAsync).toHaveBeenCalledWith(
        mockLambdaClient,
        'test-runtime-123',
        expect.objectContaining({
          type: 'invoke_trigger',
          userCode: testUserCode,
          trigger: testPayload.trigger,
          data: testPayload.data,
          authToken: testPayload.authToken,
          executionId: testPayload.executionId,
        })
      );
    });
  });

  describe('getDefinitions', () => {
    it('should invoke Lambda synchronously and return definitions', async () => {
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

      mockedLambdaUtils.invokeLambdaSync.mockResolvedValue(expectedDefinitions);

      const result = await runtime.getDefinitions(testConfig, testUserCode, {});

      expect(result).toEqual(expectedDefinitions);
      expect(mockedLambdaUtils.invokeLambdaSync).toHaveBeenCalledWith(
        mockLambdaClient,
        'test-runtime-123',
        expect.objectContaining({
          type: 'get_definitions',
          userCode: testUserCode,
          providerConfigs: {},
        })
      );
    });
  });

  describe('destroyRuntime', () => {
    it('should delete Lambda function', async () => {
      mockedLambdaUtils.deleteLambdaFunction.mockResolvedValue();

      await runtime.destroyRuntime(testConfig);

      expect(mockedLambdaUtils.deleteLambdaFunction).toHaveBeenCalledWith(
        mockLambdaClient,
        'test-runtime-123'
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true when Lambda is healthy', async () => {
      mockedLambdaUtils.isLambdaHealthy.mockResolvedValue(true);

      const result = await runtime.isHealthy(testConfig);

      expect(result).toBe(true);
    });

    it('should return false when Lambda is not healthy', async () => {
      mockedLambdaUtils.isLambdaHealthy.mockResolvedValue(false);

      const result = await runtime.isHealthy(testConfig);

      expect(result).toBe(false);
    });
  });

  describe('teardownUnusedRuntimes', () => {
    it('should be a no-op for Lambda runtime', async () => {
      // This should not throw and should complete immediately
      await runtime.teardownUnusedRuntimes();
      // No assertions needed - just verifying it doesn't throw
    });
  });
});
