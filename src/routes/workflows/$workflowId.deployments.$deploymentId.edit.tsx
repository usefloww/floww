import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { handleApiError, ApiError } from "@/lib/api";
import { WorkflowDeployment, WorkflowDeploymentStatus } from "@/types/api";
import { getDeployment, updateDeployment } from "@/lib/server/deployments";
import { Loader } from "@/components/Loader";
import { ArrowLeft, Save, X } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";
import { useMonacoTypes } from "@/hooks/useMonacoTypes";

export const Route = createFileRoute("/workflows/$workflowId/deployments/$deploymentId/edit")({
  component: EditDeploymentPage,
});

function EditDeploymentPage() {
  const { workflowId, deploymentId } = Route.useParams();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<Record<string, string>>({});
  const [entrypoint, setEntrypoint] = useState<string>("");
  const [currentFile, setCurrentFile] = useState<string>("");
  const monacoTheme = useMonacoTheme();
  const { beforeMount: beforeMonacoMount, onMount: onMonacoMount } = useMonacoTypes();

  // Use TanStack Query to fetch deployment
  const { data: deploymentData, isLoading } = useQuery({
    queryKey: ['deployment', deploymentId],
    queryFn: () => getDeployment({ data: { deploymentId } }),
  });

  // Map the server function response to the expected format
  const deployment: WorkflowDeployment | undefined = deploymentData && deploymentData.userCode ? {
    id: deploymentData.id,
    workflowId: deploymentData.workflowId,
    runtimeId: deploymentData.runtimeId,
    deployedById: deploymentData.deployedById ?? undefined,
    status: (deploymentData.status.toLowerCase() === 'failed' 
      ? WorkflowDeploymentStatus.FAILED 
      : deploymentData.status.toLowerCase() === 'inactive'
      ? WorkflowDeploymentStatus.INACTIVE
      : WorkflowDeploymentStatus.ACTIVE) as WorkflowDeploymentStatus,
    deployedAt: deploymentData.deployedAt,
    note: deploymentData.note ?? undefined,
    userCode: deploymentData.userCode as { files: Record<string, string>; entrypoint: string },
  } : undefined;

  // Update local state when deployment data changes
  useEffect(() => {
    if (!deployment) return;

    // Filter to only TypeScript/JavaScript files
    const allFiles = deployment.userCode?.files || {};
    const tsFiles: Record<string, string> = {};
    Object.keys(allFiles).forEach((fileName) => {
      if (
        fileName.endsWith('.ts') ||
        fileName.endsWith('.tsx') ||
        fileName.endsWith('.js') ||
        fileName.endsWith('.jsx')
      ) {
        tsFiles[fileName] = allFiles[fileName];
      }
    });

    setCode(tsFiles);
    const initialEntrypoint = deployment.userCode?.entrypoint || "";

    // Find the initial file to display (entrypoint if it's a TS file, or first TS file)
    const initialFile =
      (initialEntrypoint && (initialEntrypoint.endsWith('.ts') || initialEntrypoint.endsWith('.tsx') || initialEntrypoint.endsWith('.js') || initialEntrypoint.endsWith('.jsx')) && tsFiles[initialEntrypoint])
        ? initialEntrypoint
        : Object.keys(tsFiles)[0] || "";

    setEntrypoint(initialFile);
    setCurrentFile(initialFile);
  }, [deployment]);

  const handleSave = async () => {
    if (!deployment) return;

    try {
      setIsSaving(true);
      setError(null);
      
      // Merge TS files back with original files to preserve non-TS files
      const allFiles = deployment.userCode?.files || {};
      const updatedFiles = { ...allFiles, ...code };
      
      await updateDeployment({
        data: {
          deploymentId,
          userCode: {
            files: updatedFiles,
            entrypoint: currentFile || entrypoint,
          },
        },
      });

      // Navigate back to deployments page
      navigate({
        to: "/workflows/$workflowId/deployments",
        params: { workflowId },
        search: { tab: "edit" },
      });
    } catch (err) {
      // Extract structured error data if available
      if (err instanceof ApiError && err.data?.detail) {
        const errorDetail = err.data.detail;
        // Format structured errors nicely
        if (errorDetail.failedTriggers && Array.isArray(errorDetail.failedTriggers)) {
          const formattedErrors = errorDetail.failedTriggers.map((trigger: any) => {
            const parts = [];
            if (trigger.providerType) parts.push(`Provider: ${trigger.providerType}`);
            if (trigger.triggerType) parts.push(`Trigger: ${trigger.triggerType}`);
            if (trigger.error) parts.push(`Error: ${trigger.error}`);
            return parts.join(', ');
          });
          const baseMessage = errorDetail.message || 'Failed to create one or more triggers';
          setError(`${baseMessage}\n\n${formattedErrors.join('\n')}`);
        } else {
          setError(handleApiError(err));
        }
      } else {
        setError(handleApiError(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    navigate({
      to: "/workflows/$workflowId/deployments",
      params: { workflowId },
      search: { tab: "edit" },
    });
  };

  // Get the current file content
  const currentFileContent = code[currentFile] || "";

  // Get all TypeScript file names
  const tsFileNames = Object.keys(code);

  return (
    <Loader isLoading={isLoading} loadingMessage="Loading deployment...">
      <div className="space-y-6">
        {!deployment ? (
          <div className="text-center py-12">
            <h3 className="mt-2 text-sm font-medium text-foreground">Deployment not found</h3>
            <p className="mt-1 text-sm text-muted-foreground">The deployment you're looking for doesn't exist.</p>
          </div>
        ) : tsFileNames.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="mt-2 text-sm font-medium text-foreground">No TypeScript files</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This deployment doesn't contain any TypeScript files to edit.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  {...({
                    to: "/workflows/$workflowId/deployments",
                    params: { workflowId },
                    className: "text-muted-foreground hover:text-foreground transition-colors"
                  } as any)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                  <h1 className="text-3xl font-bold text-foreground">Edit Deployment</h1>
                  <p className="text-muted-foreground mt-1">Edit deployment code</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted flex items-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? "Saving..." : "Save"}</span>
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                <div className="whitespace-pre-wrap font-medium">{error}</div>
              </div>
            )}

            {/* Monaco Editor with Tabs */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* File Tabs */}
              {tsFileNames.length > 1 && (
                <div className="border-b border-border bg-muted flex overflow-x-auto">
                  {tsFileNames.map((fileName) => (
                    <button
                      key={fileName}
                      onClick={() => setCurrentFile(fileName)}
                      className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        fileName === currentFile
                          ? "border-primary text-primary bg-card"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {fileName}
                    </button>
                  ))}
                </div>
              )}

              {/* Single file indicator when only one file */}
              {tsFileNames.length === 1 && (
                <div className="border-b border-border px-4 py-2 bg-muted">
                  <span className="text-sm font-medium text-foreground">{tsFileNames[0]}</span>
                </div>
              )}

              {/* Editor */}
              <Editor
                height="600px"
                defaultLanguage="typescript"
                value={currentFileContent}
                onChange={(value) => {
                  setCode({
                    ...code,
                    [currentFile]: value || "",
                  });
                }}
                theme={monacoTheme}
                beforeMount={beforeMonacoMount}
                onMount={onMonacoMount}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </>
        )}
      </div>
    </Loader>
  );
}

