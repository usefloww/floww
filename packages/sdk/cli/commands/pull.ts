import fs from "fs";
import path from "path";
import {
  fetchWorkflow,
  fetchWorkflows,
  fetchActiveDeployment,
} from "../api/apiMethods";
import {
  hasProjectConfig,
  loadProjectConfig,
  saveProjectConfig,
} from "../config/projectConfig";
import { getValidAuth } from "../auth/tokenUtils";
import { logger } from "../utils/logger";

interface PullOptions {
  outputDir?: string;
  json?: boolean;
}

/**
 * Classify the state of a directory for pull operations.
 */
function classifyDirectory(dir: string): "empty" | "has_config" | "non_empty" {
  if (!fs.existsSync(dir)) {
    return "empty";
  }

  const entries = fs.readdirSync(dir);
  if (entries.length === 0) {
    return "empty";
  }

  if (hasProjectConfig(dir)) {
    return "has_config";
  }

  return "non_empty";
}

/**
 * Resolve a workflow identifier (name or ID) to a workflow ID.
 */
async function resolveWorkflowIdentifier(
  identifier: string
): Promise<string> {
  // Try as a direct ID first by fetching it
  try {
    const workflow = await fetchWorkflow(identifier);
    return workflow.id;
  } catch {
    // Not a valid ID, try as a name
  }

  // Search by name
  const workflows = await fetchWorkflows();
  const match = workflows.find(
    (w) => w.name.toLowerCase() === identifier.toLowerCase()
  );

  if (!match) {
    throw new Error(
      `Workflow not found: "${identifier}". Provide a valid workflow ID or name.`
    );
  }

  return match.id;
}

export async function pullCommand(
  workflowArg: string | undefined,
  options: PullOptions
) {
  const jsonOutput = options.json ?? false;

  // Check authentication
  const auth = await getValidAuth();
  if (!auth) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: "Not authenticated" }));
    } else {
      logger.error("Not logged in. Run 'npx floww login' first.");
    }
    process.exit(1);
  }

  // Determine target directory
  const targetDir = options.outputDir
    ? path.resolve(options.outputDir)
    : process.cwd();

  // Create output directory if it doesn't exist
  if (options.outputDir && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Classify directory state and apply rules
  const dirState = classifyDirectory(targetDir);
  let workflowId: string;

  switch (dirState) {
    case "empty": {
      if (!workflowArg) {
        const msg = "No workflow specified. Usage: floww pull <workflow-id-or-name>";
        if (jsonOutput) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          logger.error(msg);
        }
        process.exit(1);
      }
      workflowId = await resolveWorkflowIdentifier(workflowArg);
      break;
    }

    case "has_config": {
      if (workflowArg) {
        const msg =
          "Cannot specify workflow ID when floww.yaml exists. Use `floww pull` without arguments to pull from the configured workflow.";
        if (jsonOutput) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          logger.error(msg);
        }
        process.exit(1);
      }
      const config = loadProjectConfig(targetDir);
      if (!config.workflowId) {
        const msg = "floww.yaml exists but has no workflowId configured.";
        if (jsonOutput) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          logger.error(msg);
        }
        process.exit(1);
      }
      workflowId = config.workflowId;
      break;
    }

    case "non_empty": {
      const msg =
        "Directory is not empty and has no floww.yaml. Use an empty directory or a directory with an existing floww.yaml.";
      if (jsonOutput) {
        console.log(JSON.stringify({ error: msg }));
      } else {
        logger.error(msg);
      }
      process.exit(1);
    }
  }

  // Fetch workflow metadata
  if (!jsonOutput) {
    logger.info("Fetching workflow...");
  }

  let workflow;
  try {
    workflow = await fetchWorkflow(workflowId);
  } catch (error) {
    const msg = `Failed to fetch workflow: ${error instanceof Error ? error.message : error}`;
    if (jsonOutput) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      logger.error(msg);
    }
    process.exit(1);
  }

  // Fetch active deployment
  if (!jsonOutput) {
    logger.info("Fetching active deployment...");
  }

  const deployment = await fetchActiveDeployment(workflowId);
  if (!deployment) {
    const msg = "No active deployment found for this workflow.";
    if (jsonOutput) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      logger.error(msg);
    }
    process.exit(1);
  }

  if (!deployment.userCode?.files) {
    const msg = "Active deployment has no source files.";
    if (jsonOutput) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      logger.error(msg);
    }
    process.exit(1);
  }

  // Write all files from userCode.files to disk
  const writtenFiles: string[] = [];
  for (const [filePath, content] of Object.entries(deployment.userCode.files)) {
    const fullPath = path.join(targetDir, filePath);
    const fileDir = path.dirname(fullPath);

    // Create subdirectories as needed
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf-8");
    writtenFiles.push(filePath);
  }

  // Build floww.yaml config
  const configData: Record<string, any> = {
    workflowId: workflow.id,
    name: workflow.name,
    entrypoint: deployment.userCode.entrypoint,
  };

  if (workflow.description) {
    configData.description = workflow.description;
  }

  if (
    deployment.providerMappings &&
    Object.keys(deployment.providerMappings).length > 0
  ) {
    configData.providers = deployment.providerMappings;
  }

  // Save floww.yaml (merge with existing if present)
  if (hasProjectConfig(targetDir)) {
    saveProjectConfig(configData, targetDir, true);
  } else {
    saveProjectConfig(configData, targetDir);
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify({
        workflowId: workflow.id,
        workflowName: workflow.name,
        deploymentId: deployment.id,
        entrypoint: deployment.userCode.entrypoint,
        files: writtenFiles,
        directory: targetDir,
      })
    );
  } else {
    logger.success(`Pulled workflow "${workflow.name}"`);
    logger.plain(`   Deployment: ${deployment.id}`);
    logger.plain(`   Entrypoint: ${deployment.userCode.entrypoint}`);
    logger.plain(`   Files: ${writtenFiles.length}`);
    for (const file of writtenFiles) {
      logger.plain(`     - ${file}`);
    }
    logger.plain(`   Directory: ${targetDir}`);
  }
}
