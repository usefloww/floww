import { describe, it, expect } from 'vitest';
import { ExecutionContext } from './ExecutionContext';

describe('ExecutionContext', () => {
  describe('constructor and basic operations', () => {
    it('should create an empty context', () => {
      const ctx = new ExecutionContext();
      expect(ctx.getAuthToken()).toBeUndefined();
      expect(ctx.getWorkflowId()).toBeUndefined();
    });

    it('should create context with initial data', () => {
      const ctx = new ExecutionContext({
        authToken: 'test-token',
        workflowId: 'wf-123',
      });
      expect(ctx.getAuthToken()).toBe('test-token');
      expect(ctx.getWorkflowId()).toBe('wf-123');
    });

    it('should set and get auth token', () => {
      const ctx = new ExecutionContext();
      ctx.setAuthToken('new-token');
      expect(ctx.getAuthToken()).toBe('new-token');
    });

    it('should set and get workflow ID', () => {
      const ctx = new ExecutionContext();
      ctx.setWorkflowId('wf-456');
      expect(ctx.getWorkflowId()).toBe('wf-456');
    });

    it('should set and get custom values', () => {
      const ctx = new ExecutionContext();
      ctx.set('userId', 'user-123');
      ctx.set('requestId', 'req-456');

      expect(ctx.get('userId')).toBe('user-123');
      expect(ctx.get('requestId')).toBe('req-456');
    });

    it('should return undefined for non-existent keys', () => {
      const ctx = new ExecutionContext();
      expect(ctx.get('nonexistent')).toBeUndefined();
    });
  });

  describe('fromEvent', () => {
    it('should extract auth_token from webhook event', () => {
      const event = {
        body: { test: 'data' },
        headers: {},
        auth_token: 'webhook-token',
      };

      const ctx = ExecutionContext.fromEvent(event);
      expect(ctx.getAuthToken()).toBe('webhook-token');
    });

    it('should extract workflow_id from realtime event', () => {
      const event = {
        type: 'message',
        workflow_id: 'wf-789',
        payload: {},
        auth_token: 'realtime-token',
      };

      const ctx = ExecutionContext.fromEvent(event);
      expect(ctx.getAuthToken()).toBe('realtime-token');
      expect(ctx.getWorkflowId()).toBe('wf-789');
    });

    it('should handle events without auth_token', () => {
      const event = {
        scheduledTime: new Date(),
        actualTime: new Date(),
      };

      const ctx = ExecutionContext.fromEvent(event);
      expect(ctx.getAuthToken()).toBeUndefined();
    });

    it('should handle null/undefined events', () => {
      const ctx1 = ExecutionContext.fromEvent(null);
      expect(ctx1.getAuthToken()).toBeUndefined();

      const ctx2 = ExecutionContext.fromEvent(undefined);
      expect(ctx2.getAuthToken()).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all context data', () => {
      const ctx = new ExecutionContext({
        authToken: 'token',
        workflowId: 'wf-123',
        customField: 'value',
      });

      const all = ctx.getAll();
      expect(all).toEqual({
        authToken: 'token',
        workflowId: 'wf-123',
        customField: 'value',
      });
    });

    it('should return a copy of the data', () => {
      const ctx = new ExecutionContext({ authToken: 'token' });
      const all = ctx.getAll();

      // Modify the returned object
      all.authToken = 'modified';

      // Original context should be unchanged
      expect(ctx.getAuthToken()).toBe('token');
    });
  });

  describe('data isolation', () => {
    it('should not share data between contexts', () => {
      const ctx1 = new ExecutionContext({ authToken: 'token1' });
      const ctx2 = new ExecutionContext({ authToken: 'token2' });

      expect(ctx1.getAuthToken()).toBe('token1');
      expect(ctx2.getAuthToken()).toBe('token2');

      ctx1.setAuthToken('changed');
      expect(ctx1.getAuthToken()).toBe('changed');
      expect(ctx2.getAuthToken()).toBe('token2');
    });
  });

  describe('extensibility', () => {
    it('should support arbitrary key-value pairs', () => {
      const ctx = new ExecutionContext();

      ctx.set('userId', 'user-123');
      ctx.set('sessionId', 'session-456');
      ctx.set('metadata', { foo: 'bar' });

      expect(ctx.get('userId')).toBe('user-123');
      expect(ctx.get('sessionId')).toBe('session-456');
      expect(ctx.get('metadata')).toEqual({ foo: 'bar' });
    });

    it('should support typed get', () => {
      const ctx = new ExecutionContext();

      ctx.set('count', 42);
      ctx.set('metadata', { name: 'test' });

      const count = ctx.get<number>('count');
      const metadata = ctx.get<{ name: string }>('metadata');

      expect(count).toBe(42);
      expect(metadata).toEqual({ name: 'test' });
    });
  });
});
