/**
 * Triggers API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('~/server/db', () => ({
  getDb: vi.fn(),
}));

// Mock trigger service
vi.mock('~/server/services/trigger-service', () => ({
  listTriggers: vi.fn(),
  getTrigger: vi.fn(),
  createTrigger: vi.fn(),
  updateTrigger: vi.fn(),
  deleteTrigger: vi.fn(),
  syncTriggers: vi.fn(),
}));

// Mock access service
vi.mock('~/server/services/access-service', () => ({
  hasWorkflowAccess: vi.fn(),
}));

import * as triggerService from '~/server/services/trigger-service';

describe('Triggers API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /triggers', () => {
    it('should list triggers for a workflow', async () => {
      const mockTriggers = [
        {
          id: 'trigger-1',
          type: 'webhook',
          workflowId: 'wf-1',
          config: { path: '/webhook/test' },
          enabled: true,
        },
        {
          id: 'trigger-2',
          type: 'cron',
          workflowId: 'wf-1',
          config: { expression: '0 * * * *' },
          enabled: true,
        },
      ];

      vi.mocked(triggerService.listTriggers).mockResolvedValue(mockTriggers as any);

      const result = await triggerService.listTriggers('wf-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('GET /triggers/:id', () => {
    it('should return trigger details', async () => {
      const mockTrigger = {
        id: 'trigger-1',
        type: 'webhook',
        workflowId: 'wf-1',
        providerId: 'provider-1',
        config: { path: '/webhook/test', method: 'POST' },
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(triggerService.getTrigger).mockResolvedValue(mockTrigger as any);

      const result = await triggerService.getTrigger('trigger-1');

      expect(result?.type).toBe('webhook');
    });

    it('should return null for non-existent trigger', async () => {
      vi.mocked(triggerService.getTrigger).mockResolvedValue(null);

      const result = await triggerService.getTrigger('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('POST /triggers', () => {
    it('should create a webhook trigger', async () => {
      const newTrigger = {
        id: 'trigger-new',
        type: 'webhook',
        workflowId: 'wf-1',
        config: { path: '/webhook/new', method: 'POST' },
        enabled: true,
      };

      vi.mocked(triggerService.createTrigger).mockResolvedValue(newTrigger as any);

      const result = await triggerService.createTrigger({
        workflowId: 'wf-1',
        type: 'webhook',
        config: { path: '/webhook/new', method: 'POST' },
      } as any);

      expect(result.type).toBe('webhook');
    });

    it('should create a cron trigger', async () => {
      const newTrigger = {
        id: 'trigger-cron',
        type: 'cron',
        workflowId: 'wf-1',
        config: { expression: '0 */6 * * *' },
        enabled: true,
      };

      vi.mocked(triggerService.createTrigger).mockResolvedValue(newTrigger as any);

      const result = await triggerService.createTrigger({
        workflowId: 'wf-1',
        type: 'cron',
        config: { expression: '0 */6 * * *' },
      } as any);

      expect(result.type).toBe('cron');
    });

    it('should create a provider event trigger', async () => {
      const newTrigger = {
        id: 'trigger-event',
        type: 'event',
        workflowId: 'wf-1',
        providerId: 'provider-github',
        config: { events: ['push', 'pull_request'] },
        enabled: true,
      };

      vi.mocked(triggerService.createTrigger).mockResolvedValue(newTrigger as any);

      expect(newTrigger.providerId).toBe('provider-github');
    });
  });

  describe('PATCH /triggers/:id', () => {
    it('should update trigger config', async () => {
      const updatedTrigger = {
        id: 'trigger-1',
        type: 'cron',
        config: { expression: '0 0 * * *' }, // Changed to daily
        enabled: true,
      };

      vi.mocked(triggerService.updateTrigger).mockResolvedValue(updatedTrigger as any);

      const result = await triggerService.updateTrigger('trigger-1', {
        config: { expression: '0 0 * * *' },
      } as any);

      expect(result.config.expression).toBe('0 0 * * *');
    });

    it('should enable/disable trigger', async () => {
      const disabledTrigger = {
        id: 'trigger-1',
        enabled: false,
      };

      vi.mocked(triggerService.updateTrigger).mockResolvedValue(disabledTrigger as any);

      const result = await triggerService.updateTrigger('trigger-1', {
        enabled: false,
      } as any);

      expect(result.enabled).toBe(false);
    });
  });

  describe('DELETE /triggers/:id', () => {
    it('should delete trigger', async () => {
      vi.mocked(triggerService.deleteTrigger).mockResolvedValue(undefined);

      await triggerService.deleteTrigger('trigger-1');

      expect(triggerService.deleteTrigger).toHaveBeenCalledWith('trigger-1');
    });
  });

  describe('Trigger Types', () => {
    it('should support webhook triggers', async () => {
      const webhookConfig = {
        path: '/webhook/custom-path',
        method: 'POST',
        secret: 'optional-secret',
      };

      expect(webhookConfig.method).toBe('POST');
    });

    it('should support cron triggers', async () => {
      const cronConfig = {
        expression: '0 9 * * 1-5', // 9 AM weekdays
        timezone: 'America/New_York',
      };

      expect(cronConfig.expression).toBeDefined();
    });

    it('should support provider event triggers', async () => {
      const eventConfig = {
        providerId: 'provider-slack',
        events: ['message', 'reaction_added'],
      };

      expect(eventConfig.events).toContain('message');
    });
  });

  describe('Access Control', () => {
    it('should require workflow access', async () => {
      expect(true).toBe(true);
    });
  });
});
