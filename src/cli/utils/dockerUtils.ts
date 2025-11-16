import { execa } from "execa";
import path from "path";
import { logger } from "./logger";
import { ProjectConfig, BuildConfig } from "../config/projectConfig";

export interface DockerBuildResult {
  localImage: string;
}

export async function dockerRetagImage(args: {
  currentTag: string;
  newTag: string;
}) {
  await execa("docker", ["tag", args.currentTag, args.newTag]);
}

export async function dockerBuildImage(
  projectConfig: ProjectConfig,
  projectDir: string,
): Promise<DockerBuildResult> {
  const workloadId = projectConfig.workflowId || "unknown";
  const localImage = `floww:${workloadId}`;

  try {
    // Build the image for x86_64 (Lambda architecture)

    // Get build configuration (with defaults)
    const buildConfig: Partial<BuildConfig> = projectConfig.build || {};
    const context = buildConfig.context || ".";
    const dockerfile = buildConfig.dockerfile || "./Dockerfile";
    const extraOptions = buildConfig.extra_options || [];

    // Resolve paths relative to project directory
    const contextPath = path.resolve(projectDir, context);
    const dockerfilePath = path.resolve(projectDir, dockerfile);

    // Check if we're in SDK examples (monorepo) - override context if needed
    const isInSdkExamples = projectDir.includes("/examples/");
    const finalContextPath = isInSdkExamples && !buildConfig.context
      ? `${projectDir}/../..`  // Use SDK root for examples if no custom context
      : contextPath;

    const finalDockerfilePath = isInSdkExamples && !buildConfig.dockerfile
      ? path.join(projectDir, "Dockerfile")  // Use project Dockerfile for examples
      : dockerfilePath;

    // Build Docker command with custom options
    const extraFlags = extraOptions.join(" ");
    const buildCmd = [
      "docker build",
      "--platform=linux/amd64",
      "--provenance=false",
      `-f "${finalDockerfilePath}"`,
      extraFlags,
      `-t "${localImage}"`,
      `"${finalContextPath}"`,
    ]
      .filter(Boolean)
      .join(" ");

    logger.debugInfo(`Building image with command: ${buildCmd}`);

    // Run Docker build asynchronously and stream output
    const subprocess = execa(buildCmd, {
      shell: true,
      all: true,
    });

    for await (const chunk of subprocess.all!) {
      const line = chunk.toString();
      // optionally print debug info
      if (logger.debug) logger.debugInfo(line.trim());
      await new Promise((r) => setTimeout(r, 0)); // yield to event loop
    }

    await subprocess; // wait for process to finish

    return {
      localImage,
    };
  } catch (error) {
    logger.error("Docker build failed:", error);
    process.exit(1);
  }
}

export async function dockerLogin(args: {
  registryUrl: string;
  token: string;
}) {
  logger.debugInfo(`Logging in to registry: ${args.registryUrl}`);
  try {
    await execa(
      "bash",
      [
        "-c",
        `echo "${args.token}" | docker login ${args.registryUrl} -u token --password-stdin`,
      ],
      {
        all: true,
      },
    );
  } catch (error) {
    logger.error("Docker registry login failed:", error);
    process.exit(1);
  }
}

export async function dockerPushImage(args: {
  imageUri: string;
}): Promise<void> {
  try {
    logger.debugInfo(`Pushing image: ${args.imageUri}`);

    // Push both tags
    const subprocess = execa("docker", ["push", args.imageUri], {
      all: true,
    });

    for await (const chunk of subprocess.all!) {
      const line = chunk.toString();
      if (logger.debug) logger.debugInfo(line.trim());
      await new Promise((r) => setTimeout(r, 0));
    }

    await subprocess;

    logger.debugInfo("Image pushed successfully!");
  } catch (error) {
    logger.error("Docker push failed:", error);
    process.exit(1);
  }
}

export async function dockerGetImageHash(args: {
  localImage: string;
}): Promise<string> {
  const { stdout } = await execa("bash", [
    "-c",
    `docker image inspect --format='{{.RootFS.Layers}}' ${args.localImage} | sha256sum`,
  ]);
  let result = stdout;
  result = result.replaceAll("-", "");
  result = result.trim();

  return result;
}
