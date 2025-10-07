import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { loadProjectConfig, hasProjectConfig, updateProjectConfig } from '../config/projectConfig';
import { getPushToken, createRuntime, updateTriggerCode, fetchWorkflows } from '../api/apiMethods';
import { getConfigValue } from '../config/configUtils';
import { initCommand } from './init';

const defaultDockerfileContent = `
FROM base-floww

# ---- deps only ----
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Set entrypoint from config (will be overridden by environment variable in Lambda)
ENV FLOWW_ENTRYPOINT=main.ts

# No source code copying - code will be provided via Lambda event payload
# Uses the universal handler from base-floww image
`

interface DockerBuildResult {
  imageTag: string;
  identifierTag: string;
  imageHash: string;
}

function ensureDockerfile(projectDir: string, projectConfig: any): string {
  const dockerfilePath = path.join(projectDir, 'Dockerfile');

  if (!fs.existsSync(dockerfilePath)) {
    console.log('📄 No Dockerfile found, creating default...');
    const entrypoint = projectConfig.entrypoint || 'main.ts';
    const dockerfileContent = defaultDockerfileContent.replace('ENV FLOWW_ENTRYPOINT=main.ts', `ENV FLOWW_ENTRYPOINT=${entrypoint}`);
    fs.writeFileSync(dockerfilePath, dockerfileContent.trim());
    console.log('✅ Created default Dockerfile');
  }

  return dockerfilePath;
}

function buildDockerImage(projectConfig: any, projectDir: string): DockerBuildResult {
  const version = projectConfig.version || 'latest';
  const registryUrl = getConfigValue('registryUrl');

  // Use trigger-lambda as the image name format
  const imageTag = `${registryUrl}/trigger-lambda:${version}`;

  // Tag with namespace and workflow for identification
  const identifierTag = `${registryUrl}/trigger-lambda:${projectConfig.namespaceId}-${projectConfig.workflowId || 'unknown'}`;

  console.log(`🐳 Building Docker image: ${imageTag}`);
  console.log(`   Additional tag: ${identifierTag}`);

  try {
    // Build the image with multiple tags
    execSync(`docker build -t "${imageTag}" -t "${identifierTag}" .`, {
      cwd: projectDir,
      stdio: 'inherit'
    });

    // Get image hash
    const imageHashOutput = execSync(`docker images --no-trunc --quiet "${imageTag}"`, {
      encoding: 'utf-8'
    });
    const imageHash = imageHashOutput.trim();

    console.log(`✅ Built image with hash: ${imageHash}`);

    return {
      imageTag,
      identifierTag,
      imageHash
    };
  } catch (error) {
    console.error('❌ Docker build failed:', error);
    process.exit(1);
  }
}


function pushDockerImage(imageTag: string, identifierTag: string, token: string): void {
  console.log('🔐 Logging in to registry...');
  const registryUrl = getConfigValue('registryUrl');

  try {
    // Login to registry
    execSync(`echo "${token}" | docker login ${registryUrl} -u token --password-stdin`, {
      stdio: ['pipe', 'inherit', 'inherit']
    });

    console.log('📤 Pushing images...');

    // Push both tags
    execSync(`docker push "${imageTag}"`, {
      stdio: 'inherit'
    });

    execSync(`docker push "${identifierTag}"`, {
      stdio: 'inherit'
    });

    console.log('✅ Images pushed successfully!');
  } catch (error) {
    console.error('❌ Docker push failed:', error);
    process.exit(1);
  }
}


async function selectWorkflow(): Promise<string> {
  const workflows = await fetchWorkflows();

  if (workflows.length === 0) {
    console.error('❌ No workflows found. Create one first in the Floww dashboard.');
    process.exit(1);
  }

  console.log('\n📋 Select a workflow to deploy to:');
  workflows.forEach((workflow, index) => {
    console.log(`  ${index + 1}. ${workflow.name}${workflow.namespace_name ? ` (${workflow.namespace_name})` : ''}${workflow.description ? ` - ${workflow.description}` : ''}`);
  });

  // For now, return the first workflow as default
  // TODO: Implement proper interactive selection
  const selectedWorkflow = workflows[0];
  console.log(`\n✅ Selected: ${selectedWorkflow.name}`);
  console.log('💡 Tip: Run "floww init" to set a default workflow for this project');

  return selectedWorkflow.id;
}




/**
 * Deploy the triggers to the server
 *
 * - Check workflow id to deploy to (read from floww.yaml)
 *    - if not provided, ask user to select a workflow from list or create new one
 *    - if provided, check if workflow exists
 * 
 * - Update the runtime if needed
 *    - build the runtime docker image (build with default if Dockerfile is not provided)
 *    - get token to push to docker registry
 *    - push the runtime docker image to the docker registry
 *    - create new runtime in backend
 *
 * - Update the triggers
 *    - post request to backend to update code
 */
export async function deployCommand() {
  const projectDir = process.cwd();

  // Auto-initialize if no config exists
  if (!hasProjectConfig()) {
    console.log('🚀 No project configuration found. Let\'s set up your project first!\n');

    try {
      await initCommand({ silent: false });
      console.log('\n🚀 Continuing with deployment...\n');
    } catch (error) {
      console.error('❌ Initialization failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Load project config
  let projectConfig = loadProjectConfig();
  console.log(`🚀 Deploying project: ${projectConfig.name}`);

  // Handle workflow selection if workflowId is missing (fallback)
  if (!projectConfig.workflowId) {
    console.log('📋 No workflowId specified, selecting workflow...');

    try {
      const selectedWorkflowId = await selectWorkflow();

      // Update floww.yaml with selected workflow
      projectConfig = updateProjectConfig({ workflowId: selectedWorkflowId });
      console.log('✅ Workflow saved to floww.yaml');
    } catch (error) {
      console.error('❌ Workflow selection failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // 1. Ensure Dockerfile exists
  ensureDockerfile(projectDir, projectConfig);

  // 2. Build Docker image
  const buildResult = buildDockerImage(projectConfig, projectDir);

  // 3. Get push token from backend
  const registryUrl = getConfigValue('registryUrl');
  const imageTagRegex = new RegExp(`${registryUrl.replace('.', '\\.')}\\/(.+):(.+)`);
  const [, imageName, tag] = buildResult.imageTag.match(imageTagRegex) || [];
  if (!imageName || !tag) {
    console.error('❌ Failed to parse image tag');
    process.exit(1);
  }

  const pushToken = await getPushToken(imageName, tag);

  // 4. Push images to registry
  pushDockerImage(buildResult.imageTag, buildResult.identifierTag, pushToken);

  // 5. Create runtime and deployment
  const runtimeResult = await createRuntime({
    workflow_id: projectConfig.workflowId!,
    image_uri: buildResult.imageTag,
    hash: buildResult.imageHash,
    name: projectConfig.name,
    version: projectConfig.version || 'latest',
    config: {
      dockerfile_created: !fs.existsSync(path.join(process.cwd(), 'Dockerfile')),
      project_config: projectConfig
    }
  });

  console.log('✅ Runtime created successfully!');
  console.log(`   Runtime ID: ${runtimeResult.runtime_id}`);
  console.log(`   Deployment ID: ${runtimeResult.deployment_id}`);
  console.log(`   Status: ${runtimeResult.status}`);

  if (runtimeResult.reused_existing) {
    console.log('♻️ Reused existing runtime with matching hash');
  }

  // 6. Update trigger code using entrypoint from config
  const entrypoint = projectConfig.entrypoint || 'main.ts';

  console.log(`📝 Uploading project code with entrypoint: ${entrypoint}`);
  await updateTriggerCode(projectConfig.workflowId!, projectDir, entrypoint);

  console.log('\n🎉 Deploy completed successfully!');
}




