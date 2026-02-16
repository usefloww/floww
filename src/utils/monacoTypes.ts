// Monaco instance is provided at runtime from @monaco-editor/react
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoInstance = any;

export interface PackageTypeConfig {
  name: string;
  version: string;
  typeDefinitionPath?: string;
}

const DEFAULT_PACKAGE_VERSIONS: Record<string, string> = {
  floww: "0.0.29",
};

const CDN_BASE_URL = "https://unpkg.com";

// Cache for fetched type definitions to avoid refetching
const typeDefinitionCache = new Map<string, string>();

// Track if Monaco has been configured
let monacoConfigured = false;

async function fetchTypeDefinitions(
  packageName: string,
  version: string,
  typeDefinitionPath: string = "dist/index.d.ts"
): Promise<string> {
  const cacheKey = `${packageName}@${version}/${typeDefinitionPath}`;
  
  // Return cached version if available
  const cached = typeDefinitionCache.get(cacheKey);
  if (cached) {
    console.log(`[Monaco] Using cached types for ${cacheKey}`);
    return cached;
  }
  
  const url = `${CDN_BASE_URL}/${packageName}@${version}/${typeDefinitionPath}`;
  console.log(`[Monaco] Fetching types from: ${url}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(
      `Failed to fetch type definitions for ${packageName}@${version}: ${response.status} ${response.statusText}`
    );
  }
  
  const content = await response.text();
  console.log(`[Monaco] Fetched ${content.length} chars for ${packageName}`);
  typeDefinitionCache.set(cacheKey, content);
  return content;
}

function addPackageTypesToMonaco(
  monaco: MonacoInstance,
  packageName: string,
  typeContent: string
): void {
  // The type definitions need to be wrapped in a declare module block
  // so Monaco can resolve imports like: import { Builtin } from "floww"
  
  // First, add the raw type content at the file path
  const filePath = `file:///node_modules/${packageName}/index.d.ts`;
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    typeContent,
    filePath
  );
  
  // Then, add a module declaration that re-exports everything
  // This is the key part that makes `import { ... } from "floww"` work
  const moduleDeclaration = `declare module "${packageName}" {
${typeContent}
}`;
  
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    moduleDeclaration,
    `file:///node_modules/@types/${packageName}/index.d.ts`
  );
  
  console.log(`[Monaco] Added types for "${packageName}" (${typeContent.length} chars)`);
}

function configureCompilerOptions(monaco: MonacoInstance): void {
  if (monacoConfigured) {
    console.log('[Monaco] Already configured, skipping');
    return;
  }
  
  console.log('[Monaco] Configuring compiler options');
  
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.None,
    strict: false, // Disable strict to reduce validation errors
    noEmit: true,
    skipLibCheck: true,
    allowNonTsExtensions: true,
  });
  
  // Disable semantic validation initially to prevent errors before types load
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  
  monacoConfigured = true;
}

// Pre-fetch types so they're ready when Monaco initializes
export async function prefetchPackageTypes(
  packages: PackageTypeConfig[] = []
): Promise<Map<string, string>> {
  // Skip if running on server
  if (typeof window === 'undefined') {
    console.log('[Monaco] Skipping prefetch - running on server');
    return new Map();
  }
  
  const packagesToLoad = packages.length > 0 
    ? packages 
    : [{ name: "floww", version: DEFAULT_PACKAGE_VERSIONS.floww }];
  
  console.log('[Monaco] Prefetching types for:', packagesToLoad.map(p => `${p.name}@${p.version}`));
  
  const results = new Map<string, string>();
  
  await Promise.all(
    packagesToLoad.map(async (config) => {
      const { name, version, typeDefinitionPath = "dist/index.d.ts" } = config;
      try {
        const content = await fetchTypeDefinitions(name, version, typeDefinitionPath);
        results.set(name, content);
      } catch (error) {
        console.error(`[Monaco] Failed to prefetch types for ${name}@${version}:`, error);
      }
    })
  );
  
  return results;
}

// Configure Monaco before the editor mounts (synchronous)
export function configureMonacoBeforeMount(
  monaco: MonacoInstance,
  prefetchedTypes?: Map<string, string>
): void {
  configureCompilerOptions(monaco);
  
  // If we have prefetched types, add them now
  if (prefetchedTypes && prefetchedTypes.size > 0) {
    console.log('[Monaco] Adding', prefetchedTypes.size, 'prefetched type packages');
    prefetchedTypes.forEach((content, packageName) => {
      addPackageTypesToMonaco(monaco, packageName, content);
    });
  } else {
    console.log('[Monaco] No prefetched types available yet');
  }
}

// Load types after mount (async) - for types that weren't prefetched
export async function loadTypesAfterMount(
  monaco: MonacoInstance,
  packages: PackageTypeConfig[] = []
): Promise<void> {
  const packagesToLoad = packages.length > 0 
    ? packages 
    : [{ name: "floww", version: DEFAULT_PACKAGE_VERSIONS.floww }];
  
  console.log('[Monaco] Loading types after mount for:', packagesToLoad.map(p => p.name));
  
  await Promise.all(
    packagesToLoad.map(async (config) => {
      const { name, version, typeDefinitionPath = "dist/index.d.ts" } = config;
      try {
        const content = await fetchTypeDefinitions(name, version, typeDefinitionPath);
        addPackageTypesToMonaco(monaco, name, content);
      } catch (error) {
        console.error(`[Monaco] Failed to load types for ${name}@${version}:`, error);
      }
    })
  );
}