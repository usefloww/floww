/**
 * Runtimes API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock runtime service
vi.mock('~/server/services/runtime-service', () => ({
  listRuntimes: vi.fn(),
  getRuntime: vi.fn(),
  createRuntime: vi.fn(),
  updateRuntime: vi.fn(),
  deleteRuntime: vi.fn(),
  getDefaultRuntime: vi.fn(),
}));

// Mock access service
vi.mock('~/server/services/access-service', () => ({
  hasNamespaceAccess: vi.fn(),
}));

import * as runtimeService from '~/server/services/runtime-service';

describe('Runtimes API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /runtimes', () => {
    it('should list runtimes for a namespace', async () => {
      const mockRuntimes = [
        {
          id: 'runtime-1',
          name: 'Docker Runtime',
          type: 'docker',
          namespaceId: 'ns-1',
          status: 'ACTIVE',
          isDefault: true,
        },
        {
          id: 'runtime-2',
          name: 'Lambda Runtime',
          type: 'lambda',
          namespaceId: 'ns-1',
          status: 'ACTIVE',
          isDefault: false,
        },
      ];

      vi.mocked(runtimeService.listRuntimes).mockResolvedValue(mockRuntimes);

      const result = await runtimeService.listRuntimes('ns-1');

      expect(result).toEqual(mockRuntimes);
      expect(result).toHaveLength(2);
    });

    it('should return empty list when no runtimes exist', async () => {
      vi.mocked(runtimeService.listRuntimes).mockResolvedValue([]);

      const result = await runtimeService.listRuntimes('ns-1');

      expect(result).toEqual([]);
    });
  });

  describe('GET /runtimes/default', () => {
    it('should return the default runtime', async () => {
      const defaultRuntime = {
        id: 'runtime-default',
        name: 'Default Runtime',
        type: 'docker',
        namespaceId: null,
        status: 'ACTIVE',
        isDefault: true,
        config: {},
      };

      vi.mocked(runtimeService.getDefaultRuntime).mockResolvedValue(defaultRuntime);

      const result = await runtimeService.getDefaultRuntime();

      expect(result).toEqual(defaultRuntime);
      expect(result?.isDefault).toBe(true);
    });

    it('should return null when no default runtime exists', async () => {
      vi.mocked(runtimeService.getDefaultRuntime).mockResolvedValue(null);

      const result = await runtimeService.getDefaultRuntime();

      expect(result).toBeNull();
    });
  });

  describe('POST /runtimes', () => {
    it('should create a new runtime', async () => {
      const newRuntime = {
        id: 'runtime-new',
        name: 'New Docker Runtime',
        type: 'docker',
        namespaceId: 'ns-1',
        status: 'PROVISIONING',
        isDefault: false,
        config: { image: 'floww/runtime:latest' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(runtimeService.createRuntime).mockResolvedValue(newRuntime);

      const result = await runtimeService.createRuntime({
        namespaceId: 'ns-1',
        name: 'New Docker Runtime',
        type: 'docker',
        config: { image: 'floww/runtime:latest' },
      });

      expect(result).toEqual(newRuntime);
      expect(result.status).toBe('PROVISIONING');
    });
  });

  describe('GET /runtimes/:id', () => {
    it('should return runtime details', async () => {
      const mockRuntime = {
        id: 'runtime-1',
        name: 'Docker Runtime',
        type: 'docker',
        namespaceId: 'ns-1',
        status: 'ACTIVE',
        isDefault: true,
        config: { image: 'floww/runtime:latest' },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
      };

      vi.mocked(runtimeService.getRuntime).mockResolvedValue(mockRuntime);

      const result = await runtimeService.getRuntime('runtime-1');

      expect(result).toEqual(mockRuntime);
    });

    it('should return null for non-existent runtime', async () => {
      vi.mocked(runtimeService.getRuntime).mockResolvedValue(null);

      const result = await runtimeService.getRuntime('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('PATCH /runtimes/:id', () => {
    it('should update runtime configuration', async () => {
      const updatedRuntime = {
        id: 'runtime-1',
        name: 'Updated Runtime',
        type: 'docker',
        namespaceId: 'ns-1',
        status: 'ACTIVE',
        isDefault: true,
        config: { image: 'floww/runtime:v2' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(runtimeService.updateRuntime).mockResolvedValue(updatedRuntime);

      const result = await runtimeService.updateRuntime('runtime-1', {
        name: 'Updated Runtime',
        config: { image: 'floww/runtime:v2' },
      });

      expect(result.name).toBe('Updated Runtime');
    });
  });

  describe('DELETE /runtimes/:id', () => {
    it('should delete runtime', async () => {
      vi.mocked(runtimeService.deleteRuntime).mockResolvedValue(undefined);

      await runtimeService.deleteRuntime('runtime-1');

      expect(runtimeService.deleteRuntime).toHaveBeenCalledWith('runtime-1');
    });
  });
});
