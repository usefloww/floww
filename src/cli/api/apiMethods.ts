import { loadTokens } from '../auth/authUtils';
import { getValidAuth } from '../auth/tokenUtils';
import { getConfigValue } from '../config/configUtils';

// Import fetch dynamically to handle ES module issues in bundled CLI
async function getFetch() {
  const { default: fetch } = await import('node-fetch');
  return fetch;
}

// Type definitions for API responses
export interface Namespace {
  id: string;
  name: string;
  display_name: string;
  user_owner_id?: string;
  organization_owner_id?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  namespace_id: string;
  namespace_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RuntimeCreateRequest {
  workflow_id: string;
  image_uri: string;
  hash: string;
  name: string;
  version: string;
  config?: any;
}

export interface RuntimeCreateResponse {
  runtime_id: string;
  deployment_id: string;
  status: string;
  deployed_at: string;
  reused_existing: boolean;
}

export interface PushTokenRequest {
  image_name: string;
  tag: string;
}

export interface PushTokenResponse {
  password: string;
  expires_in: number;
}

// Helper function to make authenticated API calls
async function makeApiCall<T>(endpoint: string, options: any = {}): Promise<T> {
  const auth = await getValidAuth();

  if (!auth) {
    throw new Error('Not logged in. Please run "floww login" first.');
  }

  const fetch = await getFetch();
  const backendUrl = getConfigValue('backendUrl');

  const response = await fetch(`${backendUrl}/api${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json() as T;
}

// Namespace API methods
export async function fetchNamespaces(): Promise<Namespace[]> {
  const data = await makeApiCall<{ namespaces: Namespace[] }>('/namespaces');
  return data.namespaces;
}

// Workflow API methods
export async function fetchWorkflows(): Promise<Workflow[]> {
  const data = await makeApiCall<{ workflows: Workflow[] }>('/workflows');
  return data.workflows;
}

export async function createWorkflow(
  name: string,
  namespaceId: string,
  description?: string
): Promise<Workflow> {
  return await makeApiCall<Workflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify({
      name,
      namespace_id: namespaceId,
      description
    })
  });
}

export async function updateTriggerCode(
  workflowId: string,
  projectDir: string,
  entrypoint: string
): Promise<void> {
  // Import fs and path dynamically to handle bundling issues
  const fs = await import('fs/promises');
  const path = await import('path');

  console.log('📝 Reading project files...');

  // Read all files in the project directory recursively
  const files: Record<string, string> = {};

  async function readDirectory(dirPath: string, relativePath: string = '') {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      // Skip node_modules, .git, and other common directories
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', '.floww', 'pulumi-state'].includes(entry.name)) {
          await readDirectory(fullPath, relativeFilePath);
        }
      } else if (entry.isFile()) {
        // Include source files (.ts, .js, .json, etc.)
        if (/\.(ts|js|json|yaml|yml)$/.test(entry.name)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            files[relativeFilePath] = content;
          } catch (error) {
            console.warn(`⚠️ Could not read file: ${relativeFilePath}`);
          }
        }
      }
    }
  }

  await readDirectory(projectDir);

  console.log(`📦 Collected ${Object.keys(files).length} files`);

  await makeApiCall(`/workflows/${workflowId}/code`, {
    method: 'PUT',
    body: JSON.stringify({
      files,
      entrypoint
    })
  });
}

// Runtime API methods
export async function getPushToken(
  imageName: string,
  tag: string
): Promise<string> {
  const data = await makeApiCall<PushTokenResponse>('/runtimes/push_token', {
    method: 'POST',
    body: JSON.stringify({
      image_name: imageName,
      tag: tag
    })
  });
  return data.password;
}

export async function createRuntime(
  runtimeData: RuntimeCreateRequest
): Promise<RuntimeCreateResponse> {
  return await makeApiCall<RuntimeCreateResponse>('/runtimes', {
    method: 'POST',
    body: JSON.stringify(runtimeData)
  });
}