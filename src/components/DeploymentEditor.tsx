import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, handleApiError } from "@/lib/api";
import { WorkflowDeployment, WorkflowDeploymentsResponse, WorkflowDeploymentStatus } from "@/types/api";
import { Loader } from "@/components/Loader";
import { Save, X, Loader2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";
import { useMonacoTypes } from "@/hooks/useMonacoTypes";

interface DeploymentEditorProps {
  workflowId: string;
  deploymentId?: string;
  onSave?: () => void;
  onCancel?: () => void;
}

export function DeploymentEditor({ workflowId, deploymentId, onSave, onCancel }: DeploymentEditorProps) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<Record<string, string>>({});
  const [entrypoint, setEntrypoint] = useState<string>("");
  const [currentFile, setCurrentFile] = useState<string>("");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(deploymentId || null);
  const monacoTheme = useMonacoTheme();
  const { beforeMount: beforeMonacoMount, onMount: onMonacoMount } = useMonacoTypes();

  // Fetch all deployments
  const { data: allDeployments = [], isLoading: isLoadingDeployments } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: async () => {
      const params = { workflowId: workflowId };
      const data = await api.get<WorkflowDeploymentsResponse>("/workflow-deployments", { params });
      const sorted = (data.deployments || []).sort(
        (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
      );
      return sorted;
    },
  });

  // Auto-select deployment if not already selected
  useEffect(() => {
    if (allDeployments.length > 0 && !selectedDeploymentId) {
      if (deploymentId && allDeployments.find(d => d.id === deploymentId)) {
        setSelectedDeploymentId(deploymentId);
      } else {
        setSelectedDeploymentId(allDeployments[0].id);
      }
    }
  }, [allDeployments, deploymentId, selectedDeploymentId]);

  // Fetch selected deployment details
  const { data: deployment, isLoading: isLoadingDeployment } = useQuery({
    queryKey: ['deployment', selectedDeploymentId],
    queryFn: async () => {
      if (!selectedDeploymentId) return null;
      return await api.get<WorkflowDeployment>(`/workflow-deployments/${selectedDeploymentId}`);
    },
    enabled: !!selectedDeploymentId,
  });

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

      // Get all files from original deployment to preserve non-TS files
      const allFiles = {
        ...deployment.userCode.files,
        ...code,
      };

      // Create a new deployment instead of updating
      const deploymentData = {
        workflowId: workflowId,
        runtimeId: deployment.runtimeId,
        code: {
          files: allFiles,
          entrypoint: currentFile || entrypoint,
        },
      };

      await api.post("/workflow-deployments", deploymentData);

      // Show success notification
      showSuccessNotification(
        "New version created",
        "Your deployment has been saved as a new version."
      );

      // Invalidate queries to refetch deployments
      await queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] });

      // Reset to show the new deployment
      setSelectedDeploymentId(null);

      if (onSave) {
        onSave();
      }
    } catch (error) {
      const errorMessage = handleApiError(error);
      setError(errorMessage);
      showErrorNotification(
        "Failed to save deployment",
        errorMessage
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isLoadingDeployments || isLoadingDeployment;
  const currentFileContent = code[currentFile] || "";
  const tsFileNames = Object.keys(code);

  // Format deployment date for dropdown
  const formatDeploymentDate = (deployment: WorkflowDeployment) => {
    const date = new Date(deployment.deployedAt);
    return `Version ${deployment.id.slice(0, 8)} - ${date.toLocaleString()}`;
  };

  return (
    <Loader isLoading={isLoading} loadingMessage="Loading deployment...">
      <div className="space-y-4">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!deployment ? (
          <div className="text-center py-12">
            <h3 className="mt-2 text-sm font-medium text-foreground">No deployment found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              No deployment found for this workflow.
            </p>
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
            {/* Version Selector and Actions */}
            <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-foreground">Version:</label>
          <select
            value={selectedDeploymentId || ""}
            onChange={(e) => setSelectedDeploymentId(e.target.value)}
            disabled={isSaving}
            className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {allDeployments.map((dep) => (
              <option key={dep.id} value={dep.id}>
                {formatDeploymentDate(dep)} {dep.status === WorkflowDeploymentStatus.ACTIVE ? "(Active)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-3">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save as New Version</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Saving indicator */}
      {isSaving && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg p-4 flex items-center space-x-3">
          <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Creating new version...</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Please wait while we save your changes</p>
          </div>
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

