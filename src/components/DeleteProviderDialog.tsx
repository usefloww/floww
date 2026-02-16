import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Provider } from "@/types/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/api";
import { deleteProvider } from "@/lib/server/providers";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";
import { AlertTriangle } from "lucide-react";

interface DeleteProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider | null;
  namespaceId: string;
}

export function DeleteProviderDialog({
  open,
  onOpenChange,
  provider,
  namespaceId,
}: DeleteProviderDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (providerId: string) => {
      return await deleteProvider({ data: { providerId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", namespaceId] });
      showSuccessNotification("Provider deleted", "The provider has been deleted successfully.");
      onOpenChange(false);
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to delete provider", errorMessage);
    },
  });

  const handleDelete = () => {
    if (provider) {
      deleteMutation.mutate(provider.id);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!provider) return null;

  const providerName = provider.alias || provider.name || "Unnamed Provider";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Provider</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the provider and may affect workflows that depend on it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-900 dark:text-red-200 mb-1">
                  Are you sure you want to delete this provider?
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300">
                  <strong>{providerName}</strong> ({provider.type.toUpperCase()}) will be permanently deleted.
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
            {deleteMutation.isPending ? "Deleting..." : "Delete Provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

