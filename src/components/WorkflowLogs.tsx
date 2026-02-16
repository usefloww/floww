import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { api, handleApiError } from "@/lib/api";
import { ExecutionLogEntry } from "@/types/api";
import { Loader } from "@/components/Loader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkflowLogsProps {
  workflowId: string;
}

export function WorkflowLogs({ workflowId }: WorkflowLogsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  // Debounce search query to avoid refetching on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow-logs", workflowId, debouncedSearch, levelFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 100, offset: 0 };
      if (debouncedSearch) params.q = debouncedSearch;
      if (levelFilter && levelFilter !== "all") params.level = levelFilter.toUpperCase();

      return await api.get<{ results: ExecutionLogEntry[] }>(
        `/executions/workflows/${workflowId}/logs`,
        { params }
      );
    },
  });

  const logs = data?.results || [];
  const errorMessage = error ? handleApiError(error) : null;

  const getLevelBadge = (level: string) => {
    const config: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      debug: { variant: "outline", label: "DEBUG" },
      info: { variant: "secondary", label: "INFO" },
      warn: { variant: "default", label: "WARN" },
      error: { variant: "destructive", label: "ERROR" },
      log: { variant: "secondary", label: "LOG" },
    };
    const normalized = level.toLowerCase();
    const c = config[normalized];
    if (!c) return <Badge variant="outline" className="font-mono text-xs">{level}</Badge>;
    return (
      <Badge variant={c.variant} className="font-mono text-xs">
        {c.label}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  // Only show full-page loader on initial load (no data yet)
  const showInitialLoader = isLoading && !data;

  return (
    <div className="space-y-4">
      {/* Search and Filter - always mounted to preserve focus */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="log">Log</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {errorMessage}
        </div>
      )}

      {showInitialLoader ? (
        <Loader isLoading={true} loadingMessage="Loading logs...">
          <div />
        </Loader>
      ) : (
        /* Log entries */
        <div className="bg-zinc-900 dark:bg-zinc-950 border border-zinc-700 dark:border-zinc-800 rounded-lg overflow-hidden">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No logs found
            </div>
          ) : (
            <div className="divide-y divide-zinc-700/50 max-h-[600px] overflow-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="px-4 py-2 flex items-start gap-3 hover:bg-zinc-800/50"
                >
                  <span className="font-mono text-xs text-zinc-500 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  {getLevelBadge(log.level)}
                  <Link
                    to="/workflows/$workflowId/executions/$executionId"
                    params={{ workflowId, executionId: log.executionId }}
                    className="font-mono text-xs text-zinc-500 hover:text-zinc-300 whitespace-nowrap"
                  >
                    {log.executionId.substring(0, 8)}
                  </Link>
                  <pre className="text-sm text-zinc-100 whitespace-pre-wrap font-mono flex-1 break-all">
                    {log.message}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
