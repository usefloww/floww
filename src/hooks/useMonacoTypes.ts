import { useEffect, useState, useRef, useCallback } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { 
  prefetchPackageTypes, 
  configureMonacoBeforeMount, 
  loadTypesAfterMount,
  type PackageTypeConfig 
} from "@/utils/monacoTypes";

interface UseMonacoTypesOptions {
  packages?: PackageTypeConfig[];
  enabled?: boolean;
}

export function useMonacoTypes(options: UseMonacoTypesOptions = {}) {
  const { packages, enabled = true } = options;
  // Start with false to avoid hydration mismatch - loading happens client-side only
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const prefetchedTypesRef = useRef<Map<string, string>>(new Map());
  const monacoRef = useRef<any>(null);
  const hasFetchedRef = useRef(false);

  // Prefetch types on mount (client-side only)
  useEffect(() => {
    // Skip if not enabled, already fetched, or running on server
    if (!enabled || hasFetchedRef.current || typeof window === 'undefined') {
      return;
    }

    hasFetchedRef.current = true;
    setIsLoading(true);

    async function prefetch() {
      try {
        console.log('[Monaco] Prefetching types...');
        const types = await prefetchPackageTypes(packages);
        console.log('[Monaco] Types prefetched:', types.size, 'packages');
        
        prefetchedTypesRef.current = types;
        
        // If Monaco is already available, add the types now
        if (monacoRef.current && types.size > 0) {
          types.forEach((content, packageName) => {
            console.log(`[Monaco] Adding types for ${packageName} (${content.length} chars)`);
            monacoRef.current.languages.typescript.typescriptDefaults.addExtraLib(
              content,
              `file:///node_modules/${packageName}/index.d.ts`
            );
          });
        }
        
        setIsLoading(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to prefetch type definitions");
        setError(error);
        setIsLoading(false);
        console.error("[Monaco] Types prefetch error:", error);
      }
    }

    prefetch();
  }, [enabled, packages]);

  // Called BEFORE the editor is created - configure Monaco synchronously
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    if (!enabled || typeof window === 'undefined') return;
    
    console.log('[Monaco] beforeMount called');
    monacoRef.current = monaco;
    
    // Configure compiler options and add any prefetched types
    configureMonacoBeforeMount(monaco, prefetchedTypesRef.current);
  }, [enabled]);

  // Called AFTER the editor is created - load any remaining types
  const handleMount: OnMount = useCallback(async (_editor, monaco) => {
    if (!enabled || typeof window === 'undefined') return;
    
    console.log('[Monaco] onMount called, prefetched types:', prefetchedTypesRef.current.size);
    monacoRef.current = monaco;
    
    // If types weren't prefetched in time, load them now
    if (prefetchedTypesRef.current.size === 0) {
      console.log('[Monaco] Loading types after mount...');
      try {
        await loadTypesAfterMount(monaco, packages);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to load type definitions");
        setError(error);
        console.error("[Monaco] Types loading error:", error);
      }
    }
  }, [enabled, packages]);

  return {
    beforeMount: handleBeforeMount,
    onMount: handleMount,
    isLoading,
    error,
  };
}
