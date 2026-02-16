import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Workflow } from "@/types/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/api";
import { deleteWorkflow } from "@/lib/server/workflows";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";
import { AlertTriangle } from "lucide-react";

interface DeleteWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | null;
  namespaceId: string;
}

export function DeleteWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  namespaceId,
}: DeleteWorkflowDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      return await deleteWorkflow({ data: { workflowId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", namespaceId] });
      showSuccessNotification("Workflow deleted", "The workflow has been deleted successfully.");
      onOpenChange(false);
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to delete workflow", errorMessage);
    },
  });

  const handleDelete = () => {
    if (workflow) {
      deleteMutation.mutate(workflow.id);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!workflow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Workflow</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the workflow and all its deployments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-900 dark:text-red-200 mb-1">
                  Are you sure you want to delete this workflow?
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300">
                  <strong>{workflow.name}</strong> will be permanently deleted along with all its deployments and execution history.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

