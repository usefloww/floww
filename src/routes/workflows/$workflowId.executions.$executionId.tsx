import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { handleApiError } from "@/lib/api";
import { ExecutionHistory, ExecutionStatus, LogLevel } from "@/types/api";
import { getExecution, getExecutionLogs } from "@/lib/server/executions";
import { Loader } from "@/components/Loader";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/workflows/$workflowId/executions/$executionId")({
  component: ExecutionDetailPage,
});

function ExecutionDetailPage() {
  const { workflowId, executionId } = Route.useParams();

  // Fetch execution details
  const { data: executionData, isLoading: executionLoading, error: executionError } = useQuery({
    queryKey: ['execution', executionId],
    queryFn: () => getExecution({ data: { executionId } }),
  });

  // Fetch execution logs
  const { data: logsData } = useQuery({
    queryKey: ['execution-logs', executionId],
    queryFn: () => getExecutionLogs({ data: { executionId } }),
    enabled: !!executionData,
  });

  // Combine execution data with logs to match expected format
  const execution: ExecutionHistory | undefined = executionData ? {
    id: executionData.id,
    workflowId: executionData.workflowId,
    triggerId: executionData.triggerId,
    deploymentId: null,
    status: executionData.status as ExecutionStatus,
    receivedAt: executionData.startedAt,
    startedAt: executionData.startedAt,
    completedAt: executionData.completedAt,
    durationMs: executionData.completedAt && executionData.startedAt 
      ? new Date(executionData.completedAt).getTime() - new Date(executionData.startedAt).getTime()
      : null,
    errorMessage: executionData.error,
    logEntries: logsData?.results.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      level: log.level as LogLevel,
      message: log.message,
    })) || null,
    triggerType: null,
    webhookPath: null,
    webhookMethod: null,
  } as ExecutionHistory : undefined;

  const isLoading = executionLoading;
  const error = executionError;

  const errorMessage = error ? handleApiError(error) : null;

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '');
  };

  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) return "—";
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(2)}s`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      completed: { variant: "default", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
      started: { variant: "secondary", label: "Started" },
      received: { variant: "outline", label: "Received" },
      timeout: { variant: "destructive", label: "Timeout" },
      no_deployment: { variant: "outline", label: "No Deployment" },
    };

    const config = statusConfig[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <Loader isLoading={isLoading} loadingMessage="Loading execution details...">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link
            to="/workflows/$workflowId/deployments"
            params={{ workflowId }}
            search={{ tab: "executions" }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Execution Details</h1>
            <p className="text-muted-foreground mt-1">View detailed execution information</p>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {errorMessage}
          </div>
        )}

        {!execution ? (
          <div className="text-center py-12">
            <h3 className="mt-2 text-sm font-medium text-foreground">Execution not found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The execution you're looking for doesn't exist.
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-6 space-y-6">
            {/* Status */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
              <div>{getStatusBadge(execution.status)}</div>
            </div>

            {/* Execution ID */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Execution ID</h3>
              <p className="font-mono text-sm text-foreground">{execution.id}</p>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Received At</h3>
                <p className="font-mono text-sm text-foreground">
                  {formatTimestamp(execution.receivedAt)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Started At</h3>
                <p className="font-mono text-sm text-foreground">
                  {formatTimestamp(execution.startedAt)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Completed At</h3>
                <p className="font-mono text-sm text-foreground">
                  {formatTimestamp(execution.completedAt)}
                </p>
              </div>
            </div>

            {/* Duration */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Duration</h3>
              <p className="font-mono text-sm text-foreground">
                {formatDuration(execution.durationMs)}
              </p>
            </div>

            {/* Trigger Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Trigger Type</h3>
                <p className="font-mono text-sm text-foreground">
                  {execution.triggerType || "—"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Trigger ID</h3>
                <p className="font-mono text-sm text-foreground">
                  {execution.triggerId || "—"}
                </p>
              </div>
            </div>

            {/* Webhook Information */}
            {(execution.webhookPath || execution.webhookMethod) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Webhook Method</h3>
                  <p className="font-mono text-sm text-foreground">
                    {execution.webhookMethod || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Webhook Path</h3>
                  <p className="font-mono text-sm text-foreground">
                    {execution.webhookPath || "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Deployment ID */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Deployment ID</h3>
              <p className="font-mono text-sm text-foreground">
                {execution.deploymentId || "—"}
              </p>
            </div>

            {/* Error Message */}
            {execution.errorMessage && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Error Message</h3>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
                  <pre className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap font-mono">
                    {execution.errorMessage}
                  </pre>
                </div>
              </div>
            )}

            {/* Logs */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Logs</h3>
              {execution.logEntries && execution.logEntries.length > 0 ? (
                <div className="bg-zinc-900 dark:bg-zinc-950 border border-zinc-700 dark:border-zinc-800 rounded-lg overflow-hidden max-h-96 overflow-auto">
                  <div className="divide-y divide-zinc-700/50">
                    {execution.logEntries.map((log: { id: string; timestamp: string; level: string; message: string }) => (
                      <div
                        key={log.id}
                        className="px-4 py-2 flex items-start gap-3"
                      >
                        <span className="font-mono text-xs text-zinc-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <Badge
                          variant={
                            log.level === "error" ? "destructive" :
                            log.level === "warn" ? "default" :
                            log.level === "debug" ? "outline" :
                            "secondary"
                          }
                          className="font-mono text-xs"
                        >
                          {log.level.toUpperCase()}
                        </Badge>
                        <pre className="text-sm text-zinc-100 whitespace-pre-wrap font-mono flex-1 break-all">
                          {log.message}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No logs available</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Loader>
  );
}
