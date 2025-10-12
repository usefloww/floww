import { getValidAuth } from "../auth/tokenUtils";
import { getConfigValue } from "../config/configUtils";

// Import fetch dynamically to handle ES module issues in bundled CLI
async function getFetch() {
  const { default: fetch } = await import("node-fetch");
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

export interface RuntimeConfig {
  image_hash: string;
}

export interface RuntimeCreateRequest {
  config: RuntimeConfig;
}

export interface RuntimeCreateResponse {
  id: string;
  config: any;
  creation_status: string;
  creation_logs: any[];
}

export interface RuntimeStatusResponse {
  id: string;
  config: any;
  creation_status: string;
  creation_logs: any[];
}

export interface WorkflowDeploymentUserCode {
  files: Record<string, string>;
  entrypoint: string;
}

export interface WorkflowDeploymentCreateRequest {
  workflow_id: string;
  runtime_id: string;
  code: WorkflowDeploymentUserCode;
}

export interface WorkflowDeploymentResponse {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  runtime_id: string;
  runtime_name?: string;
  deployed_by_id?: string;
  status: string;
  deployed_at: string;
  note?: string;
  user_code?: WorkflowDeploymentUserCode;
}

export interface PushTokenRequest {
  image_name: string;
  tag: string;
}

export interface PushTokenResponse {
  password: string;
  expires_in: number;
  image_tag: string;
  registry_url: string;
}

// Helper function to make authenticated API calls
async function makeApiCall<T>(endpoint: string, options: any = {}): Promise<T> {
  const auth = await getValidAuth();

  if (!auth) {
    throw new Error('Not logged in. Please run "floww login" first.');
  }

  const fetch = await getFetch();
  const backendUrl = getConfigValue("backendUrl");

  const response = await fetch(`${backendUrl}/api${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return (await response.json()) as T;
}

// Namespace API methods
export async function fetchNamespaces(): Promise<Namespace[]> {
  const data = await makeApiCall<{ namespaces: Namespace[] }>("/namespaces");
  return data.namespaces;
}

// Workflow API methods
export async function fetchWorkflows(): Promise<Workflow[]> {
  const data = await makeApiCall<{ workflows: Workflow[] }>("/workflows");
  return data.workflows;
}

export async function createWorkflow(
  name: string,
  namespaceId: string,
  description?: string
): Promise<Workflow> {
  return await makeApiCall<Workflow>("/workflows", {
    method: "POST",
    body: JSON.stringify({
      name,
      namespace_id: namespaceId,
      description,
    }),
  });
}

// Helper function to read project files
export async function readProjectFiles(
  projectDir: string,
  entrypoint: string
): Promise<WorkflowDeploymentUserCode> {
  // Import fs and path dynamically to handle bundling issues
  const fs = await import("fs/promises");
  const path = await import("path");

  console.log("📝 Reading project files...");

  // Read all files in the project directory recursively
  const files: Record<string, string> = {};

  async function readDirectory(dirPath: string, relativePath: string = "") {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = relativePath
        ? path.join(relativePath, entry.name)
        : entry.name;

      // Skip node_modules, .git, and other common directories
      if (entry.isDirectory()) {
        if (
          !["node_modules", ".git", "dist", ".floww", "pulumi-state"].includes(
            entry.name
          )
        ) {
          await readDirectory(fullPath, relativeFilePath);
        }
      } else if (entry.isFile()) {
        // Include source files (.ts, .js, .json, etc.)
        if (/\.(ts|js|json|yaml|yml)$/.test(entry.name)) {
          try {
            const content = await fs.readFile(fullPath, "utf-8");
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

  return {
    files,
    entrypoint,
  };
}

// Custom error for when image already exists
export class ImageAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageAlreadyExistsError";
  }
}

// Runtime API methods
export async function getPushData(
  image_hash: string
): Promise<PushTokenResponse> {
  try {
    const data = await makeApiCall<PushTokenResponse>("/runtimes/push_token", {
      method: "POST",
      body: JSON.stringify({
        image_hash: image_hash,
      }),
    });
    return data;
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTP 409")) {
      throw new ImageAlreadyExistsError("Image already exists in registry");
    }
    throw error;
  }
}

export class RuntimeAlreadyExistsError extends Error {
  id: string;

  constructor(id: string, message: string) {
    super(message);
    this.id = id;
    this.name = "RuntimeAlreadyExistsError";
  }
}

export async function createRuntime(
  runtimeData: RuntimeCreateRequest
): Promise<RuntimeCreateResponse> {
  try {
    return await makeApiCall<RuntimeCreateResponse>("/runtimes", {
      method: "POST",
      body: JSON.stringify(runtimeData),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTP 409")) {
      throw new RuntimeAlreadyExistsError("Runtime already exists");
    }
    throw error;
  }
}

export async function getRuntimeStatus(
  runtimeId: string
): Promise<RuntimeStatusResponse> {
  return await makeApiCall<RuntimeStatusResponse>(`/runtimes/${runtimeId}`, {
    method: "GET",
  });
}

export async function createWorkflowDeployment(
  deploymentData: WorkflowDeploymentCreateRequest
): Promise<WorkflowDeploymentResponse> {
  return await makeApiCall<WorkflowDeploymentResponse>(
    "/workflow_deployments",
    {
      method: "POST",
      body: JSON.stringify(deploymentData),
    }
  );
}

export async function listWorkflowDeployments(
  workflowId?: string
): Promise<WorkflowDeploymentResponse[]> {
  const queryParams = workflowId ? `?workflow_id=${workflowId}` : "";
  const data = await makeApiCall<{ deployments: WorkflowDeploymentResponse[] }>(
    `/workflow_deployments${queryParams}`
  );
  return data.deployments;
}
