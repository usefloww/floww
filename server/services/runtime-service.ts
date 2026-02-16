/**
 * Runtime Service
 *
 * Handles runtime management - runtimes are execution environments (Lambda, Docker, K8s)
 * that run workflow code.
 */

import { eq, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { getDb } from '~/server/db';
import { runtimes } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';

export type RuntimeCreationStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REMOVED';

export interface RuntimeInfo {
  id: string;
  config: Record<string, unknown> | null;
  configHash: string;
  createdAt: Date;
  creationStatus: RuntimeCreationStatus;
  creationLogs: unknown[] | null;
}

export interface RuntimeConfig {
  runtimeId: string;
  imageDigest: string;
}

/**
 * Generate a deterministic config hash from a config object
 */
function generateConfigHash(config: Record<string, unknown>): string {
  const configStr = JSON.stringify(config, Object.keys(config).sort());
  const hashBytes = crypto.createHash('sha256').update(configStr).digest().slice(0, 16);
  // Convert to UUID format
  const hex = hashBytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Get a runtime by ID
 */
export async function getRuntime(runtimeId: string): Promise<RuntimeInfo | null> {
  const db = getDb();

  const [runtime] = await db
    .select()
    .from(runtimes)
    .where(eq(runtimes.id, runtimeId))
    .limit(1);

  if (!runtime) {
    return null;
  }

  return {
    id: runtime.id,
    config: runtime.config as Record<string, unknown> | null,
    configHash: runtime.configHash,
    createdAt: runtime.createdAt,
    creationStatus: runtime.creationStatus,
    creationLogs: runtime.creationLogs as unknown[] | null,
  };
}

/**
 * Get a runtime by config hash
 */
export async function getRuntimeByConfigHash(configHash: string): Promise<RuntimeInfo | null> {
  const db = getDb();

  const [runtime] = await db
    .select()
    .from(runtimes)
    .where(eq(runtimes.configHash, configHash))
    .limit(1);

  if (!runtime) {
    return null;
  }

  return {
    id: runtime.id,
    config: runtime.config as Record<string, unknown> | null,
    configHash: runtime.configHash,
    createdAt: runtime.createdAt,
    creationStatus: runtime.creationStatus,
    creationLogs: runtime.creationLogs as unknown[] | null,
  };
}

/**
 * List all runtimes
 */
export async function listRuntimes(
  options: {
    status?: RuntimeCreationStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<RuntimeInfo[]> {
  const db = getDb();
  const { status, limit = 50, offset = 0 } = options;

  let query = db.select().from(runtimes);

  if (status) {
    query = query.where(eq(runtimes.creationStatus, status)) as typeof query;
  }

  const result = await query.orderBy(desc(runtimes.createdAt)).limit(limit).offset(offset);

  return result.map((r) => ({
    id: r.id,
    config: r.config as Record<string, unknown> | null,
    configHash: r.configHash,
    createdAt: r.createdAt,
    creationStatus: r.creationStatus,
    creationLogs: r.creationLogs as unknown[] | null,
  }));
}

/**
 * Create a new runtime or return existing one with same config hash
 */
export async function createRuntime(config: Record<string, unknown>): Promise<RuntimeInfo> {
  const db = getDb();
  const configHash = generateConfigHash(config);

  // Check if runtime with this config already exists
  const existing = await getRuntimeByConfigHash(configHash);
  if (existing) {
    return existing;
  }

  // Create new runtime
  const [runtime] = await db
    .insert(runtimes)
    .values({
      id: generateUlidUuid(),
      config,
      configHash,
      creationStatus: 'IN_PROGRESS',
      creationLogs: [],
    })
    .returning();

  return {
    id: runtime.id,
    config: runtime.config as Record<string, unknown> | null,
    configHash: runtime.configHash,
    createdAt: runtime.createdAt,
    creationStatus: runtime.creationStatus,
    creationLogs: runtime.creationLogs as unknown[] | null,
  };
}

/**
 * Update a runtime's status
 */
export async function updateRuntimeStatus(
  runtimeId: string,
  status: RuntimeCreationStatus,
  logs?: unknown[]
): Promise<RuntimeInfo | null> {
  const db = getDb();

  const updateData: Record<string, unknown> = { creationStatus: status };
  if (logs !== undefined) {
    updateData.creationLogs = logs;
  }

  const [runtime] = await db
    .update(runtimes)
    .set(updateData)
    .where(eq(runtimes.id, runtimeId))
    .returning();

  if (!runtime) {
    return null;
  }

  return {
    id: runtime.id,
    config: runtime.config as Record<string, unknown> | null,
    configHash: runtime.configHash,
    createdAt: runtime.createdAt,
    creationStatus: runtime.creationStatus,
    creationLogs: runtime.creationLogs as unknown[] | null,
  };
}

/**
 * Add logs to a runtime
 */
export async function addRuntimeLogs(runtimeId: string, newLogs: unknown[]): Promise<void> {
  const db = getDb();

  const runtime = await getRuntime(runtimeId);
  if (!runtime) {
    return;
  }

  const existingLogs = (runtime.creationLogs as unknown[]) ?? [];
  const updatedLogs = [...existingLogs, ...newLogs];

  await db
    .update(runtimes)
    .set({ creationLogs: updatedLogs })
    .where(eq(runtimes.id, runtimeId));
}

/**
 * Delete a runtime (mark as REMOVED)
 */
export async function deleteRuntime(runtimeId: string): Promise<boolean> {
  const db = getDb();

  await db
    .update(runtimes)
    .set({ creationStatus: 'REMOVED' })
    .where(eq(runtimes.id, runtimeId));

  return true;
}

/**
 * Find runtimes that are unused (not referenced by any deployment)
 * This would typically be called by a cleanup job
 */
export async function findUnusedRuntimes(): Promise<RuntimeInfo[]> {
  const db = getDb();

  // This query finds runtimes with COMPLETED status that have no deployments
  // In production, you'd add age checks to avoid removing recently created runtimes
  const result = await db.execute<{ id: string; config: unknown; config_hash: string; created_at: Date; creation_status: RuntimeCreationStatus; creation_logs: unknown[] | null }>(sql`
    SELECT r.*
    FROM runtimes r
    LEFT JOIN workflow_deployments wd ON r.id = wd.runtime_id
    WHERE r.creation_status = 'COMPLETED'
    AND wd.id IS NULL
    AND r.created_at < NOW() - INTERVAL '1 hour'
  `);

  return (result as Array<{ id: string; config: unknown; config_hash: string; created_at: Date; creation_status: RuntimeCreationStatus; creation_logs: unknown[] | null }>).map((r) => ({
    id: r.id,
    config: r.config as Record<string, unknown> | null,
    configHash: r.config_hash,
    createdAt: r.created_at,
    creationStatus: r.creation_status,
    creationLogs: r.creation_logs,
  }));
}
