/**
 * Docker container management utilities for runtime execution.
 *
 * This module provides functions to manage Docker containers for user code execution.
 * Containers are long-running and reused across webhook invocations, with automatic cleanup
 * of idle containers.
 */

import Docker from 'dockerode';
import { hostname } from 'os';
import { logger } from '~/server/utils/logger';

// Container naming convention
const CONTAINER_NAME_PREFIX = 'floww-runtime-';
// Label keys for container metadata
const LABEL_RUNTIME_ID = 'floww.runtime.id';
const LABEL_LAST_USED = 'floww.runtime.last_used';
const LABEL_IMAGE_URI = 'floww.runtime.image_uri';

// Container idle timeout (in seconds) - containers idle longer than this will be cleaned up
const CONTAINER_IDLE_TIMEOUT = 300; // 5 minutes

// Cached network name for the backend container (detected at runtime)
let backendNetwork: string | null = null;

// Singleton Docker client
let dockerClient: Docker | null = null;

export function getDockerClient(): Docker {
  if (!dockerClient) {
    dockerClient = new Docker();
  }
  return dockerClient;
}

export function getContainerName(runtimeId: string): string {
  return `${CONTAINER_NAME_PREFIX}${runtimeId}`;
}

function getContainerUrl(containerName: string): string {
  return `http://${containerName}:8000`;
}

async function getBackendNetwork(): Promise<string> {
  if (backendNetwork !== null) {
    return backendNetwork;
  }

  try {
    const docker = getDockerClient();
    const currentHostname = hostname();

    try {
      const container = docker.getContainer(currentHostname);
      const containerInfo = await container.inspect();

      const networks = containerInfo.NetworkSettings?.Networks ?? {};
      const networkNames = Object.keys(networks);

      if (networkNames.length > 0) {
        backendNetwork = networkNames[0];
        logger.info('Detected backend network', { network: backendNetwork });
        return backendNetwork;
      }
    } catch {
      logger.warn('Could not inspect backend container, falling back to bridge');
    }
  } catch (error) {
    logger.warn('Could not detect backend network, falling back to bridge', { error: error instanceof Error ? error.message : String(error) });
  }

  backendNetwork = 'bridge';
  return backendNetwork;
}

async function ensureImageExists(docker: Docker, imageUri: string): Promise<void> {
  try {
    await docker.getImage(imageUri).inspect();
    logger.debug('Docker image already exists', { imageUri });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      logger.info('Pulling Docker image', { imageUri });
      const stream = await docker.pull(imageUri);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('Docker image pulled successfully', { imageUri });
    } else {
      throw error;
    }
  }
}

async function getContainerConfig(
  runtimeId: string,
  imageUri: string,
  containerName: string
): Promise<Docker.ContainerCreateOptions> {
  const networkMode = await getBackendNetwork();

  return {
    Image: imageUri,
    Hostname: containerName,
    name: containerName,
    Labels: {
      [LABEL_RUNTIME_ID]: runtimeId,
      [LABEL_LAST_USED]: new Date().toISOString(),
      [LABEL_IMAGE_URI]: imageUri,
    },
    HostConfig: {
      NetworkMode: networkMode,
      Memory: 512 * 1024 * 1024, // 512 MB
      CpuQuota: 100000, // 100% of one CPU
    },
  };
}

async function checkContainerHealth(containerName: string): Promise<boolean> {
  try {
    const response = await fetch(`${getContainerUrl(containerName)}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForContainerReady(containerName: string, timeout = 30): Promise<void> {
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < timeout) {
    try {
      const response = await fetch(`${getContainerUrl(containerName)}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 200) {
        logger.info('Container is ready', { containerName });
        return;
      }
    } catch {
      // Container not ready yet, wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Container ${containerName} did not become ready within ${timeout} seconds`);
}

async function getLastActivityTime(container: Docker.Container): Promise<Date> {
  try {
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: true,
      tail: 100,
    });

    const logLines = logs.toString().split('\n').filter(Boolean);

    // Search backwards for the last non-health log line
    for (let i = logLines.length - 1; i >= 0; i--) {
      const logLine = logLines[i];
      if (!logLine.includes('/health')) {
        // Extract timestamp from the log line
        // Docker timestamp format: YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ
        const match = logLine.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        if (match) {
          return new Date(match[0]);
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to get container logs', { error: error instanceof Error ? error.message : String(error) });
  }

  // Fallback to container start time
  const containerInfo = await container.inspect();
  const startedAt = containerInfo.State?.StartedAt;
  if (startedAt) {
    return new Date(startedAt);
  }

  // Final fallback: use current time
  return new Date();
}

export async function createContainer(runtimeId: string, imageUri: string): Promise<void> {
  const containerName = getContainerName(runtimeId);
  const docker = getDockerClient();

  try {
    // Check if container already exists
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.inspect();
    logger.debug('Container already exists, skipping creation', { containerName });
    return;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      logger.info('Creating new container', { containerName, imageUri });

      await ensureImageExists(docker, imageUri);
      const config = await getContainerConfig(runtimeId, imageUri, containerName);
      const container = await docker.createContainer(config);
      await container.start();

      logger.info('Container created and started', { containerName });
    } else {
      logger.error('Docker error while creating container', { runtimeId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

export interface ContainerStatusResult {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  logs: string;
}

export async function getContainerStatus(runtimeId: string): Promise<ContainerStatusResult> {
  const containerName = getContainerName(runtimeId);
  const docker = getDockerClient();

  try {
    const container = docker.getContainer(containerName);
    const containerInfo = await container.inspect();
    const state = containerInfo.State;

    if (!state?.Running) {
      return {
        status: 'FAILED',
        logs: `Container exists but is not running (Status: ${state?.Status ?? 'unknown'})`,
      };
    }

    const isHealthy = await checkContainerHealth(containerName);
    if (isHealthy) {
      return {
        status: 'COMPLETED',
        logs: 'Container is ready to accept requests',
      };
    } else {
      return {
        status: 'IN_PROGRESS',
        logs: 'Waiting for container to be healthy',
      };
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return {
        status: 'FAILED',
        logs: `Container not found: ${containerName}`,
      };
    }
    logger.error('Error checking container status', { runtimeId, error: error instanceof Error ? error.message : String(error) });
    return {
      status: 'FAILED',
      logs: `Error checking container status: ${String(error)}`,
    };
  }
}

export async function startContainerIfStopped(runtimeId: string): Promise<void> {
  const containerName = getContainerName(runtimeId);
  const docker = getDockerClient();

  try {
    const container = docker.getContainer(containerName);
    const containerInfo = await container.inspect();
    const state = containerInfo.State;

    if (state?.Running) {
      logger.debug('Container already running', { containerName });
      return;
    }

    logger.info('Container stopped, starting it', { containerName });
    await container.start();
    await waitForContainerReady(containerName);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw new Error(
        `Container ${containerName} does not exist. Runtime must be created before invocation.`
      );
    }
    logger.error('Error starting container', { runtimeId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function sendWebhookToContainer(
  runtimeId: string,
  payload: Record<string, unknown>,
  timeout = 60
): Promise<Record<string, unknown>> {
  const containerName = getContainerName(runtimeId);
  const url = `${getContainerUrl(containerName)}/execute`;

  logger.debug('Sending webhook to container', { containerName });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout * 1000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    logger.debug('Container executed webhook successfully', { containerName });
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.error('Failed to send webhook to container', { runtimeId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function cleanupIdleContainers(idleTimeout?: number): Promise<void> {
  const timeout = idleTimeout ?? CONTAINER_IDLE_TIMEOUT;
  const cutoffTime = new Date(Date.now() - timeout * 1000);
  const docker = getDockerClient();

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: {
        label: [LABEL_RUNTIME_ID],
      },
    });

    for (const containerInfo of containers) {
      try {
        const containerName = containerInfo.Names[0]?.replace(/^\//, '') ?? 'unknown';
        const runtimeId = containerInfo.Labels?.[LABEL_RUNTIME_ID];
        const container = docker.getContainer(containerInfo.Id);
        const details = await container.inspect();

        if (details.State?.Running) {
          const lastActivityTime = await getLastActivityTime(container);

          if (lastActivityTime < cutoffTime) {
            logger.info('Stopping idle container', {
              containerName,
              runtimeId,
              lastActivity: lastActivityTime.toISOString(),
              idleSeconds: (Date.now() - lastActivityTime.getTime()) / 1000,
            });
            await container.stop();
          } else {
            logger.debug('Container still active', { containerName });
          }
        }
      } catch (error) {
        logger.error('Error processing container for cleanup', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    logger.error('Error during container cleanup', { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function removeContainer(runtimeId: string): Promise<boolean> {
  const containerName = getContainerName(runtimeId);
  const docker = getDockerClient();

  try {
    const container = docker.getContainer(containerName);
    await container.remove({ force: true });
    logger.info('Container removed', { containerName });
    return true;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      logger.debug('Container not found, nothing to remove', { containerName });
      return false;
    }
    logger.error('Error removing container', { runtimeId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
