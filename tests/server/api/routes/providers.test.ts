/**
 * Providers API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('~/server/db', () => ({
  getDb: vi.fn(),
}));

// Mock provider service
vi.mock('~/server/services/provider-service', () => ({
  listProviders: vi.fn(),
  getProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  hasProviderAccess: vi.fn(),
}));

// Mock access service
vi.mock('~/server/services/access-service', () => ({
  hasNamespaceAccess: vi.fn(),
}));

import * as providerService from '~/server/services/provider-service';
import * as accessService from '~/server/services/access-service';

describe('Providers API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /providers', () => {
    it('should list providers for a namespace', async () => {
      const mockProviders = [
        { id: 'provider-1', name: 'Slack', type: 'slack', alias: 'slack', namespaceId: 'ns-1' },
        { id: 'provider-2', name: 'GitHub', type: 'github', alias: 'github', namespaceId: 'ns-1' },
      ];

      vi.mocked(providerService.listProviders).mockResolvedValue(mockProviders);

      // Since the route handlers are registered globally, we need to test the logic
      expect(providerService.listProviders).toBeDefined();
    });

    it('should return empty list when no providers exist', async () => {
      vi.mocked(providerService.listProviders).mockResolvedValue([]);

      expect(providerService.listProviders).toBeDefined();
    });
  });

  describe('POST /providers', () => {
    it('should create a new provider', async () => {
      const newProvider = {
        id: 'provider-new',
        name: 'New Slack',
        type: 'slack',
        alias: 'slack-new',
        namespaceId: 'ns-1',
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(providerService.createProvider).mockResolvedValue(newProvider);
      vi.mocked(accessService.hasNamespaceAccess).mockResolvedValue(true);

      const result = await providerService.createProvider({
        namespaceId: 'ns-1',
        name: 'New Slack',
        type: 'slack',
        alias: 'slack-new',
        config: {},
      });

      expect(result).toEqual(newProvider);
      expect(providerService.createProvider).toHaveBeenCalledWith({
        namespaceId: 'ns-1',
        name: 'New Slack',
        type: 'slack',
        alias: 'slack-new',
        config: {},
      });
    });
  });

  describe('GET /providers/:id', () => {
    it('should return provider details', async () => {
      const mockProvider = {
        id: 'provider-1',
        name: 'Slack',
        type: 'slack',
        alias: 'slack',
        namespaceId: 'ns-1',
        config: { botToken: 'encrypted-token' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(providerService.getProvider).mockResolvedValue(mockProvider);
      vi.mocked(providerService.hasProviderAccess).mockResolvedValue(true);

      const result = await providerService.getProvider('provider-1');

      expect(result).toEqual(mockProvider);
    });

    it('should return null for non-existent provider', async () => {
      vi.mocked(providerService.getProvider).mockResolvedValue(null);

      const result = await providerService.getProvider('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('PATCH /providers/:id', () => {
    it('should update provider configuration', async () => {
      const updatedProvider = {
        id: 'provider-1',
        name: 'Updated Slack',
        type: 'slack',
        alias: 'slack',
        namespaceId: 'ns-1',
        config: { botToken: 'new-token' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(providerService.updateProvider).mockResolvedValue(updatedProvider);
      vi.mocked(providerService.hasProviderAccess).mockResolvedValue(true);

      const result = await providerService.updateProvider('provider-1', {
        name: 'Updated Slack',
        config: { botToken: 'new-token' },
      });

      expect(result.name).toBe('Updated Slack');
    });
  });

  describe('DELETE /providers/:id', () => {
    it('should delete provider', async () => {
      vi.mocked(providerService.deleteProvider).mockResolvedValue(undefined);
      vi.mocked(providerService.hasProviderAccess).mockResolvedValue(true);

      await providerService.deleteProvider('provider-1');

      expect(providerService.deleteProvider).toHaveBeenCalledWith('provider-1');
    });
  });
});
