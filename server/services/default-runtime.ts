/**
 * Default Runtime Service
 *
 * Manages the default runtime that's used when no custom runtime is specified.
 * Supports Lambda, Docker, and Local runtime types.
 */

import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { getDb } from '~/server/db';
import { configurations, runtimes } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';
import { getRuntime } from '~/server/packages/runtimes';

const DEFAULT_RUNTIME_CONFIG_KEY = 'default_runtime_id';

/**
 * Generate a deterministic config hash from an image URI
 */
function generateConfigHashFromUri(imageUri: string): string {
  const hashBytes = crypto.createHash('sha256').update(imageUri).digest().slice(0, 16);
  const hex = hashBytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Prepare the default runtime on startup.
 * 
 * For Lambda:
 * 1. Generates a deterministic config_hash from the image URI
 * 2. Upserts a Runtime record with config={"image_uri": "..."}
 * 3. Stores the runtime ID in the Configuration table
 * 
 * Note: Actual Lambda function creation is done by the runtimes package.
 */
export async function prepareDefaultRuntime(): Promise<void> {
  const defaultRuntimeImage = settings.runtime.DEFAULT_RUNTIME_IMAGE;
  const runtimeType = settings.runtime.RUNTIME_TYPE;

  // Local runtime: create a runtime record immediately with COMPLETED status
  if (runtimeType === 'local') {
    const configHash = generateConfigHashFromUri('local-runtime');

    logger.info('Preparing local default runtime', { configHash });

    const db = getDb();

    const [existingRuntime] = await db
      .select()
      .from(runtimes)
      .where(eq(runtimes.configHash, configHash))
      .limit(1);

    if (existingRuntime) {
      logger.info('Local default runtime already exists', { runtimeId: existingRuntime.id });
      await setDefaultRuntimeId(existingRuntime.id);

      if (existingRuntime.creationStatus !== 'COMPLETED') {
        await db
          .update(runtimes)
          .set({ creationStatus: 'COMPLETED' })
          .where(eq(runtimes.id, existingRuntime.id));
      }
      return;
    }

    const [runtime] = await db
      .insert(runtimes)
      .values({
        id: generateUlidUuid(),
        configHash,
        config: { type: 'local' },
        creationStatus: 'COMPLETED',
        creationLogs: [],
      })
      .returning();

    logger.info('Created local default runtime record', { runtimeId: runtime.id });
    await setDefaultRuntimeId(runtime.id);
    return;
  }

  const DEFAULT_DOCKER_RUNTIME_IMAGE = 'ghcr.io/usefloww/docker-runtime:latest';

  if (!defaultRuntimeImage && runtimeType !== 'docker') {
    logger.debug('No DEFAULT_RUNTIME_IMAGE configured, skipping default runtime setup');
    return;
  }

  if (runtimeType !== 'lambda' && runtimeType !== 'docker') {
    logger.debug('Default runtime auto-setup not supported for this runtime type, skipping', { runtimeType });
    return;
  }

  const imageUri = defaultRuntimeImage || DEFAULT_DOCKER_RUNTIME_IMAGE;
  const configHash = generateConfigHashFromUri(imageUri);

  logger.info('Preparing default runtime', { imageUri, configHash });

  const db = getDb();

  // Check if runtime already exists with this config_hash
  const [existingRuntime] = await db
    .select()
    .from(runtimes)
    .where(eq(runtimes.configHash, configHash))
    .limit(1);

  if (existingRuntime) {
    logger.info('Default runtime already exists', { runtimeId: existingRuntime.id, status: existingRuntime.creationStatus });
    await setDefaultRuntimeId(existingRuntime.id);

    if (existingRuntime.creationStatus === 'COMPLETED') {
      return;
    }

    // Retry runtime creation for FAILED or IN_PROGRESS runtimes
    try {
      const runtimeImpl = getRuntime();
      const result = await runtimeImpl.createRuntime({
        runtimeId: existingRuntime.id,
        imageDigest: imageUri,
      });

      await db
        .update(runtimes)
        .set({ creationStatus: result.status, creationLogs: [] })
        .where(eq(runtimes.id, existingRuntime.id));
      logger.info('Default runtime recovered', { runtimeId: existingRuntime.id, status: result.status });
    } catch (error) {
      logger.error('Failed to recover default runtime', {
        runtimeId: existingRuntime.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await db
        .update(runtimes)
        .set({
          creationStatus: 'FAILED',
          creationLogs: [{ timestamp: new Date().toISOString(), message: String(error), level: 'error' }],
        })
        .where(eq(runtimes.id, existingRuntime.id));
    }

    return;
  }

  // Create new runtime record
  const [runtime] = await db
    .insert(runtimes)
    .values({
      id: generateUlidUuid(),
      configHash,
      config: { image_uri: imageUri },
      creationStatus: 'IN_PROGRESS',
      creationLogs: [],
    })
    .returning();

  logger.info('Created default runtime record', { runtimeId: runtime.id });
  await setDefaultRuntimeId(runtime.id);

  // Eagerly create the runtime so deploys work immediately
  try {
    const runtimeImpl = getRuntime();
    const result = await runtimeImpl.createRuntime({
      runtimeId: runtime.id,
      imageDigest: imageUri,
    });

    await db
      .update(runtimes)
      .set({ creationStatus: result.status })
      .where(eq(runtimes.id, runtime.id));
    logger.info('Default runtime created', { runtimeId: runtime.id, status: result.status });
  } catch (error) {
    logger.error('Failed to create default runtime', {
      runtimeId: runtime.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(runtimes)
      .set({
        creationStatus: 'FAILED',
        creationLogs: [{ timestamp: new Date().toISOString(), message: String(error), level: 'error' }],
      })
      .where(eq(runtimes.id, runtime.id));
  }
}

/**
 * Store the default runtime ID in the Configuration table
 */
export async function setDefaultRuntimeId(runtimeId: string): Promise<void> {
  const db = getDb();

  const [existingConfig] = await db
    .select()
    .from(configurations)
    .where(eq(configurations.key, DEFAULT_RUNTIME_CONFIG_KEY))
    .limit(1);

  if (existingConfig) {
    await db
      .update(configurations)
      .set({
        value: { runtime_id: runtimeId },
        updatedAt: new Date(),
      })
      .where(eq(configurations.key, DEFAULT_RUNTIME_CONFIG_KEY));
  } else {
    await db.insert(configurations).values({
      key: DEFAULT_RUNTIME_CONFIG_KEY,
      value: { runtime_id: runtimeId },
    });
  }

  logger.debug('Default runtime ID stored in configuration', { runtimeId });
}

/**
 * Get the default runtime ID from the Configuration table
 */
export async function getDefaultRuntimeId(): Promise<string | null> {
  const db = getDb();

  const [config] = await db
    .select()
    .from(configurations)
    .where(eq(configurations.key, DEFAULT_RUNTIME_CONFIG_KEY))
    .limit(1);

  if (!config || !config.value) {
    return null;
  }

  const value = config.value as Record<string, unknown>;

  // Handle both dict format {"runtime_id": "..."} and legacy string format
  if (typeof value === 'object' && 'runtime_id' in value) {
    return value.runtime_id as string;
  }

  return null;
}

/**
 * Check if default runtime is ready for use
 */
export async function isDefaultRuntimeReady(): Promise<boolean> {
  const runtimeId = await getDefaultRuntimeId();
  if (!runtimeId) {
    return false;
  }

  const db = getDb();

  const [runtime] = await db
    .select()
    .from(runtimes)
    .where(eq(runtimes.id, runtimeId))
    .limit(1);

  return runtime?.creationStatus === 'COMPLETED';
}

/**
 * Mark default runtime as completed
 */
export async function markDefaultRuntimeCompleted(logs?: unknown[]): Promise<void> {
  const runtimeId = await getDefaultRuntimeId();
  if (!runtimeId) {
    return;
  }

  const db = getDb();

  const updateData: Record<string, unknown> = { creationStatus: 'COMPLETED' };
  if (logs) {
    updateData.creationLogs = logs;
  }

  await db
    .update(runtimes)
    .set(updateData)
    .where(eq(runtimes.id, runtimeId));
}

/**
 * Get or create a default runtime for a specific SDK version.
 *
 * Assumes the Docker image already exists in the registry (pre-built in CI).
 * The runtime creation pipeline (Lambda/Docker) pulls it as usual.
 *
 * @returns runtime ID if available, null if the runtime creation failed
 */
export async function getOrCreateDefaultRuntimeForVersion(sdkVersion: string): Promise<string | null> {
  const registryUrl = settings.runtime.REGISTRY_URL_RUNTIME;
  if (!registryUrl) {
    logger.warn('REGISTRY_URL_RUNTIME not configured, cannot resolve versioned default runtime');
    return null;
  }

  const repositoryName = settings.runtime.REGISTRY_REPOSITORY_NAME;
  const imageUri = `${registryUrl}/${repositoryName}:default-v${sdkVersion}`;
  const configHash = generateConfigHashFromUri(imageUri);
  const configKey = `default_runtime_v_${sdkVersion}`;

  logger.info('Resolving versioned default runtime', { sdkVersion, imageUri, configHash });

  const db = getDb();

  // Check if runtime already exists with this config hash
  const [existingRuntime] = await db
    .select()
    .from(runtimes)
    .where(eq(runtimes.configHash, configHash))
    .limit(1);

  if (existingRuntime) {
    if (existingRuntime.creationStatus === 'COMPLETED' || existingRuntime.creationStatus === 'IN_PROGRESS') {
      logger.info('Versioned default runtime found', {
        sdkVersion,
        runtimeId: existingRuntime.id,
        status: existingRuntime.creationStatus,
      });
      return existingRuntime.id;
    }

    if (existingRuntime.creationStatus === 'FAILED') {
      logger.error('Versioned default runtime creation previously failed', {
        sdkVersion,
        runtimeId: existingRuntime.id,
      });
      return null;
    }
  }

  // Create new runtime record
  const [runtime] = await db
    .insert(runtimes)
    .values({
      id: generateUlidUuid(),
      configHash,
      config: { image_uri: imageUri, sdk_version: sdkVersion, is_default: true },
      creationStatus: 'IN_PROGRESS',
      creationLogs: [],
    })
    .returning();

  logger.info('Created versioned default runtime record', { sdkVersion, runtimeId: runtime.id });

  // Eagerly create the runtime so deploys work immediately
  try {
    const runtimeImpl = getRuntime();
    const result = await runtimeImpl.createRuntime({
      runtimeId: runtime.id,
      imageDigest: imageUri,
    });

    await db
      .update(runtimes)
      .set({ creationStatus: result.status })
      .where(eq(runtimes.id, runtime.id));
    logger.info('Versioned runtime created', { sdkVersion, runtimeId: runtime.id, status: result.status });
  } catch (error) {
    logger.error('Failed to create versioned runtime', {
      sdkVersion,
      runtimeId: runtime.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(runtimes)
      .set({
        creationStatus: 'FAILED',
        creationLogs: [{ timestamp: new Date().toISOString(), message: String(error), level: 'error' }],
      })
      .where(eq(runtimes.id, runtime.id));
    return null;
  }

  // Store version mapping in configurations table
  const [existingVersionConfig] = await db
    .select()
    .from(configurations)
    .where(eq(configurations.key, configKey))
    .limit(1);

  if (existingVersionConfig) {
    await db
      .update(configurations)
      .set({
        value: { runtime_id: runtime.id },
        updatedAt: new Date(),
      })
      .where(eq(configurations.key, configKey));
  } else {
    await db.insert(configurations).values({
      key: configKey,
      value: { runtime_id: runtime.id },
    });
  }

  return runtime.id;
}

/**
 * Mark default runtime as failed
 */
export async function markDefaultRuntimeFailed(logs?: unknown[]): Promise<void> {
  const runtimeId = await getDefaultRuntimeId();
  if (!runtimeId) {
    return;
  }

  const db = getDb();

  const updateData: Record<string, unknown> = { creationStatus: 'FAILED' };
  if (logs) {
    updateData.creationLogs = logs;
  }

  await db
    .update(runtimes)
    .set(updateData)
    .where(eq(runtimes.id, runtimeId));
}
