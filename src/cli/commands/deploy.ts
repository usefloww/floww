import fs from "fs";
import path from "path";
import {
  loadProjectConfig,
  hasProjectConfig,
  updateProjectConfig,
} from "../config/projectConfig";
import {
  ImageAlreadyExistsError,
  createRuntime,
  getRuntimeStatus,
  createWorkflowDeployment,
  readProjectFiles,
  fetchWorkflows,
  getPushData,
  PushTokenResponse,
  RuntimeAlreadyExistsError,
} from "../api/apiMethods";
import { initCommand } from "./init";
import {
  dockerBuildImage,
  dockerRetagImage,
  dockerLogin,
  dockerPushImage,
  dockerGetImageHash,
} from "../utils/dockerUtils";

const defaultDockerfileContent = `
FROM base-floww

# ---- deps only ----
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Set entrypoint from config (will be overridden by environment variable in Lambda)
ENV FLOWW_ENTRYPOINT=main.ts

# No source code copying - code will be provided via Lambda event payload
# Uses the universal handler from base-floww image
`;

function ensureDockerfile(projectDir: string, projectConfig: any): string {
  const dockerfilePath = path.join(projectDir, "Dockerfile");

  if (!fs.existsSync(dockerfilePath)) {
    console.log("📄 No Dockerfile found, creating default...");
    const entrypoint = projectConfig.entrypoint || "main.ts";
    const dockerfileContent = defaultDockerfileContent.replace(
      "ENV FLOWW_ENTRYPOINT=main.ts",
      `ENV FLOWW_ENTRYPOINT=${entrypoint}`
    );
    fs.writeFileSync(dockerfilePath, dockerfileContent.trim());
    console.log("✅ Created default Dockerfile");
  }

  return dockerfilePath;
}

async function pollRuntimeUntilReady(runtimeId: string): Promise<void> {
  console.log("⏳ Waiting for runtime to be ready...");

  let lastLogCount = 0;

  while (true) {
    try {
      const status = await getRuntimeStatus(runtimeId);

      // Display new logs if any
      if (status.creation_logs && status.creation_logs.length > lastLogCount) {
        const newLogs = status.creation_logs.slice(lastLogCount);
        for (const log of newLogs) {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const level = log.level || "info";
          const levelIcon =
            level === "error" ? "❌" : level === "warning" ? "⚠️" : "ℹ️";
          console.log(`   ${levelIcon} [${timestamp}] ${log.message}`);
        }
        lastLogCount = status.creation_logs.length;
      }

      // Check final status
      if (status.creation_status === "completed") {
        console.log("✅ Runtime is ready!");
        return;
      } else if (status.creation_status === "failed") {
        console.error("❌ Runtime creation failed");
        process.exit(1);
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(
        "❌ Failed to check runtime status:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }
}

async function selectWorkflow(): Promise<string> {
  const workflows = await fetchWorkflows();

  if (workflows.length === 0) {
    console.error(
      "❌ No workflows found. Create one first in the Floww dashboard."
    );
    process.exit(1);
  }

  console.log("\n📋 Select a workflow to deploy to:");
  workflows.forEach((workflow, index) => {
    console.log(
      `  ${index + 1}. ${workflow.name}${
        workflow.namespace_name ? ` (${workflow.namespace_name})` : ""
      }${workflow.description ? ` - ${workflow.description}` : ""}`
    );
  });

  // For now, return the first workflow as default
  // TODO: Implement proper interactive selection
  const selectedWorkflow = workflows[0];
  console.log(`\n✅ Selected: ${selectedWorkflow.name}`);
  console.log(
    '💡 Tip: Run "floww init" to set a default workflow for this project'
  );

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
    console.log(
      "🚀 No project configuration found. Let's set up your project first!\n"
    );

    try {
      await initCommand({ silent: false });
      console.log("\n🚀 Continuing with deployment...\n");
    } catch (error) {
      console.error(
        "❌ Initialization failed:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  // Load project config
  let projectConfig = loadProjectConfig();
  console.log(`🚀 Deploying project: ${projectConfig.name}`);

  // Handle workflow selection if workflowId is missing (fallback)
  if (!projectConfig.workflowId) {
    console.log("📋 No workflowId specified, selecting workflow...");

    try {
      const selectedWorkflowId = await selectWorkflow();

      // Update floww.yaml with selected workflow
      projectConfig = updateProjectConfig({ workflowId: selectedWorkflowId });
      console.log("✅ Workflow saved to floww.yaml");
    } catch (error) {
      console.error(
        "❌ Workflow selection failed:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  // 1. Ensure Dockerfile exists
  ensureDockerfile(projectDir, projectConfig);

  // 2. Build Docker image
  const buildResult = dockerBuildImage(projectConfig, projectDir);
  const imageHash = dockerGetImageHash({ localImage: buildResult.localImage });

  let shouldPush = true;
  let pushData: PushTokenResponse = {} as any;

  try {
    pushData = await getPushData(imageHash);
  } catch (error) {
    if (error instanceof ImageAlreadyExistsError) {
      console.log("♻️ Image already exists in registry, skipping push...");
      shouldPush = false;
    } else {
      console.error(
        "❌ Failed to get push token:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  // 4. Push images to registry (only if needed)
  if (shouldPush) {
    const imageUri = `${pushData.registry_url}:${imageHash}`;
    dockerRetagImage({ currentTag: buildResult.localImage, newTag: imageUri });
    dockerLogin({
      registryUrl: pushData.registry_url,
      token: pushData.password,
    });
    dockerPushImage({ imageUri: imageUri });
  }

  // 5. Create runtime
  console.log("🔧 Creating runtime...");
  console.log(buildResult);
  try {
    const runtimeResult = await createRuntime({
      config: {
        image_hash: imageHash,
      },
    });
  } catch (error) {
    if (error instanceof RuntimeAlreadyExistsError) {
      console.log("♻️ Runtime already exists");
    } else {
      console.error(
        "❌ Failed to create runtime:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  console.log("✅ Runtime creation started!");
  console.log(`   Runtime ID: ${runtimeResult.id}`);
  console.log(`   Status: ${runtimeResult.creation_status}`);

  // 6. Poll runtime status until completion
  await pollRuntimeUntilReady(runtimeResult.id);

  // 7. Read project files and create workflow deployment
  const entrypoint = projectConfig.entrypoint || "main.ts";
  console.log(`📝 Reading project code with entrypoint: ${entrypoint}`);

  const userCode = await readProjectFiles(projectDir, entrypoint);

  console.log("🚀 Creating workflow deployment...");
  const deploymentResult = await createWorkflowDeployment({
    workflow_id: projectConfig.workflowId!,
    runtime_id: runtimeResult.id,
    code: userCode,
  });

  console.log("✅ Workflow deployment created successfully!");
  console.log(`   Deployment ID: ${deploymentResult.id}`);
  console.log(`   Status: ${deploymentResult.status}`);
  console.log(`   Deployed At: ${deploymentResult.deployed_at}`);

  console.log("\n🎉 Deploy completed successfully!");
}
