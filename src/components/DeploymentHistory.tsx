import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, handleApiError } from "@/lib/api";
import { WorkflowDeployment, WorkflowDeploymentsResponse } from "@/types/api";
import { Loader } from "@/components/Loader";
import { MoreVertical, Edit2, Trash2 } from "lucide-react";

interface DeploymentHistoryProps {
  workflowId: string;
  onEdit?: (deploymentId: string) => void;
}

export function DeploymentHistory({ workflowId, onEdit }: DeploymentHistoryProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Use TanStack Query to fetch deployments
  const { data, isLoading, error } = useQuery({
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

  const deployments = data || [];
  const errorMessage = error ? handleApiError(error) : null;

  return (
    <Loader isLoading={isLoading} loadingMessage="Loading deployments...">
      <div className="space-y-4">
        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {errorMessage}
          </div>
        )}

        {deployments.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="mt-2 text-sm font-medium text-foreground">No deployments</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              No deployments found for this workflow.
            </p>
          </div>
        ) : (
          deployments.map((deployment, index) => (
            <DeploymentCard
              key={deployment.id}
              deployment={deployment}
              versionNumber={deployments.length - index}
              isDropdownOpen={openDropdown === deployment.id}
              onDropdownToggle={(isOpen) => setOpenDropdown(isOpen ? deployment.id : null)}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </Loader>
  );
}

interface DeploymentCardProps {
  deployment: WorkflowDeployment;
  versionNumber: number;
  isDropdownOpen: boolean;
  onDropdownToggle: (isOpen: boolean) => void;
  onEdit?: (deploymentId: string) => void;
}

function DeploymentCard({ 
  deployment, 
  versionNumber, 
  isDropdownOpen,
  onDropdownToggle,
  onEdit 
}: DeploymentCardProps) {
  // Format timestamp with seconds: YYYY-MM-DD HH:MM:SS
  const deployedTimestamp = new Date(deployment.deployedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(',', '');
  
  const versionLabel = `version ${versionNumber}`;

  const handleEdit = () => {
    onDropdownToggle(false);
    if (onEdit) {
      onEdit(deployment.id);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-foreground">{versionLabel}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">created_at: {deployedTimestamp}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => onDropdownToggle(!isDropdownOpen)}
            className="p-2 text-muted-foreground hover:text-muted-foreground rounded-lg hover:bg-muted transition-colors"
            aria-label="Options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => onDropdownToggle(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-card rounded-lg shadow-lg border border-border z-20">
                <button
                  className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center space-x-2 rounded-t-lg"
                  onClick={handleEdit}
                >
                  <Edit2 className="h-4 w-4" />
                  <span>Edit</span>
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-muted flex items-center space-x-2 rounded-b-lg"
                  onClick={() => {
                    onDropdownToggle(false);
                    // TODO: Handle delete
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

