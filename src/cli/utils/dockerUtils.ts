import { execSync } from "child_process";

export interface DockerBuildResult {
  localImage: string;
}

export function dockerRetagImage(args: { currentTag: string; newTag: string }) {
  execSync(`docker tag "${args.currentTag}" "${args.newTag}"`);
}

export function dockerBuildImage(
  projectConfig: any,
  projectDir: string
): DockerBuildResult {
  const namespaceId = projectConfig.namespaceId;
  const workloadId = projectConfig.workflowId || "unknown";
  const localImage = `floww:${namespaceId}-${workloadId}`;

  console.log(`=3 Building Docker image: ${localImage}`);

  try {
    // Build the image with multiple tags
    execSync(`docker build --provenance=false -t "${localImage}" .`, {
      cwd: projectDir,
      stdio: "inherit",
    });

    return {
      localImage,
    };
  } catch (error) {
    console.error("L Docker build failed:", error);
    process.exit(1);
  }
}

export function dockerLogin(args: { registryUrl: string; token: string }) {
  execSync(
    `echo "${args.token}" | docker login ${args.registryUrl} -u token --password-stdin`,
    {
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
}

export function dockerPushImage(args: { imageUri: string }): void {
  try {
    console.log("=� Pushing images...");

    // Push both tags
    execSync(`docker push "${args.imageUri}"`, {
      stdio: "inherit",
    });

    console.log(" Images pushed successfully!");
  } catch (error) {
    console.error("L Docker push failed:", error);
    process.exit(1);
  }
}

export function dockerGetImageHash(args: { localImage: string }): string {
  let result = execSync(
    `docker image inspect --format='{{.RootFS.Layers}}' ${args.localImage} | sha256sum`,
    {
      encoding: "utf-8",
    }
  );
  result = result.replaceAll("-", "");
  result = result.trim();

  return result;
}
