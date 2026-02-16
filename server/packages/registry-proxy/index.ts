/**
 * Registry Proxy Package
 *
 * Proxies container registry requests, handling authentication and
 * routing to the appropriate backend registry (Docker Hub, ECR, GCR, etc).
 */

import { settings } from '~/server/settings';

export interface RegistryCredentials {
  username?: string;
  password?: string;
  token?: string;
}

export interface RegistryConfig {
  type: 'dockerhub' | 'ecr' | 'gcr' | 'generic';
  url: string;
  credentials?: RegistryCredentials;
}

export interface ImageManifest {
  mediaType: string;
  digest: string;
  size: number;
  config?: {
    digest: string;
    mediaType: string;
  };
  layers?: Array<{
    digest: string;
    mediaType: string;
    size: number;
  }>;
}

export interface TagList {
  name: string;
  tags: string[];
}

/**
 * Registry proxy for handling container image operations
 */
export class RegistryProxy {
  private config: RegistryConfig;
  private token?: string;
  private tokenExpiry?: Date;

  constructor(config: RegistryConfig) {
    this.config = config;
  }

  /**
   * Authenticate with the registry
   */
  private async authenticate(): Promise<string> {
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    switch (this.config.type) {
      case 'dockerhub':
        return this.authenticateDockerHub();
      case 'ecr':
        return this.authenticateECR();
      case 'gcr':
        return this.authenticateGCR();
      default:
        return this.authenticateGeneric();
    }
  }

  private async authenticateDockerHub(): Promise<string> {
    const response = await fetch('https://auth.docker.io/token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to authenticate with Docker Hub');
    }

    const data = await response.json();
    this.token = data.token;
    this.tokenExpiry = new Date(Date.now() + 300000); // 5 minutes
    return this.token!;
  }

  private async authenticateECR(): Promise<string> {
    // In production, use @aws-sdk/client-ecr
    // const ecr = new ECRClient({ region: 'us-east-1' });
    // const response = await ecr.send(new GetAuthorizationTokenCommand({}));
    // return response.authorizationData[0].authorizationToken;
    throw new Error('ECR authentication not implemented');
  }

  private async authenticateGCR(): Promise<string> {
    // In production, use gcloud credentials or service account
    throw new Error('GCR authentication not implemented');
  }

  private async authenticateGeneric(): Promise<string> {
    if (this.config.credentials?.token) {
      return this.config.credentials.token;
    }

    if (this.config.credentials?.username && this.config.credentials?.password) {
      return Buffer.from(
        `${this.config.credentials.username}:${this.config.credentials.password}`
      ).toString('base64');
    }

    throw new Error('No credentials provided for generic registry');
  }

  /**
   * Get image manifest
   */
  async getManifest(repository: string, reference: string): Promise<ImageManifest> {
    const token = await this.authenticate();

    const response = await fetch(
      `${this.config.url}/v2/${repository}/manifests/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.docker.distribution.manifest.v2+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get manifest: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Check if image exists
   */
  async imageExists(repository: string, reference: string): Promise<boolean> {
    try {
      await this.getManifest(repository, reference);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List tags for a repository
   */
  async listTags(repository: string): Promise<TagList> {
    const token = await this.authenticate();

    const response = await fetch(`${this.config.url}/v2/${repository}/tags/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list tags: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Proxy a blob request
   */
  async proxyBlob(
    repository: string,
    digest: string
  ): Promise<{ stream: ReadableStream; contentType: string; size: number }> {
    const token = await this.authenticate();

    const response = await fetch(`${this.config.url}/v2/${repository}/blobs/${digest}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to get blob: ${response.status}`);
    }

    return {
      stream: response.body,
      contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
      size: parseInt(response.headers.get('Content-Length') ?? '0', 10),
    };
  }
}

/**
 * Create a registry proxy from configuration
 */
export function createRegistryProxy(type?: string): RegistryProxy {
  const registryType = (type ?? settings.registry.REGISTRY_TYPE) as RegistryConfig['type'];
  const registryUrl = settings.registry.REGISTRY_URL;

  return new RegistryProxy({
    type: registryType,
    url: registryUrl,
    credentials: {
      username: settings.registry.REGISTRY_USERNAME,
      password: settings.registry.REGISTRY_PASSWORD,
      token: settings.registry.REGISTRY_TOKEN,
    },
  });
}
