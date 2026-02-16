import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { updateWorkflow, deleteWorkflow, handleApiError } from "@/lib/api";
import { Workflow } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface WorkflowConfigurationProps {
  workflow: Workflow;
  namespaceId: string;
}

export function WorkflowConfiguration({ workflow, namespaceId }: WorkflowConfigurationProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description || "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Update local state when workflow changes
  useEffect(() => {
    setName(workflow.name);
    setDescription(workflow.description || "");
  }, [workflow]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      return await updateWorkflow(workflow.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflow.id] });
      queryClient.invalidateQueries({ queryKey: ["workflows", namespaceId] });
      showSuccessNotification("Workflow updated", "The workflow has been updated successfully.");
      setErrors({});
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to update workflow", errorMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await deleteWorkflow(workflow.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", namespaceId] });
      showSuccessNotification("Workflow deleted", "The workflow has been deleted successfully.");
      navigate({ to: "/workflows" });
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to delete workflow", errorMessage);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate name
    if (!name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }

    // Only send changed fields
    const updateData: { name?: string; description?: string } = {};
    if (name.trim() !== workflow.name) {
      updateData.name = name.trim();
    }
    if (description.trim() !== (workflow.description || "")) {
      updateData.description = description.trim() || undefined;
    }

    // Only update if there are changes
    if (Object.keys(updateData).length > 0) {
      updateMutation.mutate(updateData);
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const hasChanges =
    name.trim() !== workflow.name ||
    description.trim() !== (workflow.description || "");

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Basic Information</h2>
          </div>

          <div>
            <Label htmlFor="name">
              Name <span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.name;
                    return newErrors;
                  });
                }
              }}
              placeholder="My Workflow"
              disabled={updateMutation.isPending}
              className="mt-1"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of what this workflow does..."
              disabled={updateMutation.isPending}
              className="mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional description to help identify this workflow.
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button
              type="submit"
              disabled={updateMutation.isPending || !hasChanges}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="bg-card border border-red-200 dark:border-red-800/50 rounded-lg p-6">
        <div>
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Danger Zone
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete a workflow, there is no going back. Please be certain.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Workflow
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
              onClick={() => setDeleteDialogOpen(false)}
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
    </div>
  );
}

