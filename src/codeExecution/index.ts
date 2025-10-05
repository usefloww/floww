import { VirtualFileSystem } from "./VirtualFileSystem";
import { ModuleSystem } from "./ModuleSystem";
import path from "path";
import { pathToFileURL } from "url";
import fs from 'fs/promises'


export interface ExecuteUserProjectOptions {
  files: Record<string, string>;
  entryPoint: string;
}

export async function getUserProject(
  filePath: string,
  entryPoint: string
): Promise<ExecuteUserProjectOptions> {


  // Get all files in the directory
  const files = await fs.readdir(process.cwd(), {recursive: true});

  const filesMap: Record<string, string> = {};

  await Promise.all(files.map(async (file) => {
    const filePath = path.join(process.cwd(), file);
    const fileContent = await fs.readFile(filePath, 'utf8');
    filesMap[file] = fileContent;
  }));

  return {
    files: filesMap,
    entryPoint: `${filePath.replace('.ts', '')}.${entryPoint}`,
  };
}

export async function executeUserProject(
  options: ExecuteUserProjectOptions
): Promise<any> {
  const { files, entryPoint } = options;

  const vfs = new VirtualFileSystem(files);
  const moduleSystem = new ModuleSystem(vfs);

  try {
    const [fileAndExport, exportName] = entryPoint.includes(".")
      ? entryPoint.split(".", 2)
      : [entryPoint, "default"];

    // Try to find the file with extensions
    let filePath = fileAndExport;
    if (!vfs.exists(filePath)) {
      const extensions = [".ts", ".js"];
      for (const ext of extensions) {
        if (vfs.exists(filePath + ext)) {
          filePath = filePath + ext;
          break;
        }
      }
    }

    const module = moduleSystem.loadModule(filePath);

    if (exportName && exportName !== "default") {
      const exportedFunction = module[exportName];
      if (typeof exportedFunction === "function") {
        return await exportedFunction();
      }
      return exportedFunction;
    }

    if (typeof module === "function") {
      return await module();
    } else if (module.handler && typeof module.handler === "function") {
      return await module.handler();
    } else if (module.default && typeof module.default === "function") {
      return await module.default();
    }

    return module;
  } catch (error) {
    console.error("User code execution failed:", error);
    throw error;
  }
}

export { VirtualFileSystem } from "./VirtualFileSystem";
export { ModuleSystem } from "./ModuleSystem";
