import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, lazy, Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Code, Package, Activity, Settings, FileText, Sparkles, PlayCircle, Loader2 } from "lucide-react";
import { handleApiError } from "@/lib/api";
import { getWorkflow } from "@/lib/server/workflows";
import { getConfig } from "@/lib/server/config";
import { Loader } from "@/components/Loader";
import { DeploymentEditor } from "@/components/DeploymentEditor";
import { DeploymentHistory } from "@/components/DeploymentHistory";
import { ExecutionHistory } from "@/components/ExecutionHistory";
import { WorkflowConfiguration } from "@/components/WorkflowConfiguration";
import { WorkflowLogs } from "@/components/WorkflowLogs";
import { ManualTriggersSection } from "@/components/ManualTriggersSection";
import { useNamespaceStore } from "@/stores/namespaceStore";
import { ClientOnly } from "@/components/ClientOnly";

// Lazy load WorkflowBuilder since it includes heavy dependencies (@llamaindex/chat-ui, monaco-editor)
// This is wrapped in ClientOnly to completely skip SSR for this component
const WorkflowBuilder = lazy(() => import("@/components/WorkflowBuilder").then(m => ({ default: m.WorkflowBuilder })));

// Loading fallback for lazy-loaded components
function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  );
}

type TabType = "edit" | "deployments" | "executions" | "logs" | "config" | "builder" | "triggers";

export const Route = createFileRoute("/workflows/$workflowId/deployments")({
  component: DeploymentsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as TabType) || "edit",
    };
  },
});

function DeploymentsPage() {
  const { workflowId } = Route.useParams();
  const { tab } = Route.useSearch();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Check if we're on a child route (like /edit)
  const isOnChildRoute = pathname.includes('/deployments/') &&
    pathname.split('/deployments/')[1] !== '';

  // If we're on a child route, just render the outlet
  if (isOnChildRoute) {
    return <Outlet />;
  }

  const [activeTab, setActiveTab] = useState<TabType>((tab || "edit") as TabType);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const { currentNamespace } = useNamespaceStore();
  const navigate = useNavigate();

  // Fetch config to check if AI Builder is enabled
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => getConfig(),
  });

  const isAiBuilderEnabled = config?.features.aiBuilder ?? false;

  // Fetch workflow to get the name
  const { data: workflow, isLoading, error } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => getWorkflow({ data: { workflowId } }),
  });

  const errorMessage = error ? handleApiError(error) : null;

  // Redirect from builder tab if AI Builder is disabled
  useEffect(() => {
    if (tab === "builder" && !isAiBuilderEnabled && config !== undefined) {
      navigate({
        to: "/workflows/$workflowId/deployments",
        params: { workflowId },
        search: { tab: "edit" },
        replace: true,
      } as any);
      setActiveTab("edit");
    }
  }, [tab, isAiBuilderEnabled, config, workflowId, navigate]);

  const handleEdit = (deploymentId: string) => {
    setSelectedDeploymentId(deploymentId);
    setActiveTab("edit");
  };

  const handleSave = () => {
    // Refresh after save
    setSelectedDeploymentId(null);
  };

  return (
    <Loader isLoading={isLoading} loadingMessage="Loading workflow...">
      <div className="space-y-6">
        {/* Error message */}
        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {errorMessage}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link
            to="/workflows"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {workflow?.name || "Workflow"}
            </h1>
            {workflow?.description && (
              <p className="text-muted-foreground mt-1">{workflow.description}</p>
            )}
          </div>
        </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          <Link
            {...({
              to: "/workflows/$workflowId/deployments",
              params: { workflowId },
              search: { tab: "edit" },
              className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "edit"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`
            } as any)}
            onClick={() => setActiveTab("edit")}
          >
            <div className="flex items-center space-x-2">
              <Code className="h-4 w-4" />
              <span>Edit Code</span>
            </div>
          </Link>
          <Link
            {...({
              to: "/workflows/$workflowId/deployments",
              params: { workflowId },
              search: { tab: "deployments" },
              className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "deployments"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`
            } as any)}
            onClick={() => setActiveTab("deployments")}
          >
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4" />
              <span>Deployments</span>
            </div>
          </Link>
          <Link
            {...({
              to: "/workflows/$workflowId/deployments",
              params: { workflowId },
              search: { tab: "executions" },
              className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "executions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`
            } as any)}
            onClick={() => setActiveTab("executions")}
          >
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Executions</span>
            </div>
          </Link>
          <Link
            {...({
              to: "/workflows/$workflowId/deployments",
              params: { workflowId },
              search: { tab: "logs" },
              className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "logs"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`
            } as any)}
            onClick={() => setActiveTab("logs")}
          >
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Logs</span>
            </div>
          </Link>
          <Link
            {...({
              to: "/workflows/$workflowId/deployments",
              params: { workflowId },
              search: { tab: "config" },
              className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "config"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`
            } as any)}
            onClick={() => setActiveTab("config")}
          >
            <div className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Configuration</span>
            </div>
          </Link>
          {isAiBuilderEnabled && (
            <Link
              {...({
                to: "/workflows/$workflowId/deployments",
                params: { workflowId },
                search: { tab: "builder" },
                className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === "builder"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`
              } as any)}
              onClick={() => setActiveTab("builder")}
            >
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4" />
                <span>Builder</span>
              </div>
            </Link>
          )}
          <Link
            {...({
              to: "/workflows/$workflowId/deployments",
              params: { workflowId },
              search: { tab: "triggers" },
              className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "triggers"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`
            } as any)}
            onClick={() => setActiveTab("triggers")}
          >
            <div className="flex items-center space-x-2">
              <PlayCircle className="h-4 w-4" />
              <span>Manual Triggers</span>
            </div>
          </Link>
        </nav>
      </div>

      {/* Content */}
      <div>
        {activeTab === "edit" ? (
          <DeploymentEditor
            workflowId={workflowId}
            deploymentId={selectedDeploymentId || undefined}
            onSave={handleSave}
          />
        ) : activeTab === "deployments" ? (
          <DeploymentHistory
            workflowId={workflowId}
            onEdit={handleEdit}
          />
        ) : activeTab === "executions" ? (
          <ExecutionHistory
            workflowId={workflowId}
          />
        ) : activeTab === "logs" ? (
          <WorkflowLogs
            workflowId={workflowId}
          />
        ) : activeTab === "config" ? (
          workflow && currentNamespace ? (
            <WorkflowConfiguration
              workflow={workflow as any}
              namespaceId={currentNamespace.id}
            />
          ) : null
        ) : activeTab === "builder" && isAiBuilderEnabled ? (
          <ClientOnly fallback={<TabLoadingFallback />}>
            <Suspense fallback={<TabLoadingFallback />}>
              <WorkflowBuilder workflowId={workflowId} />
            </Suspense>
          </ClientOnly>
        ) : activeTab === "triggers" ? (
          <ManualTriggersSection workflowId={workflowId} />
        ) : null}
      </div>

        {/* Render child routes */}
        <Outlet />
      </div>
    </Loader>
  );
}

