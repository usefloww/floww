import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, handleApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";

interface SecretConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespaceId: string;
  secretName: string;
  secretDescription?: string;
}

export function SecretConfigModal({
  open,
  onOpenChange,
  namespaceId,
  secretName,
  secretDescription,
}: SecretConfigModalProps) {
  const [value, setValue] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setValue("");
    }
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return api.post("/secrets", {
        namespaceId,
        name: secretName,
        value,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets", namespaceId] });
      showSuccessNotification("Secret saved", `Secret "${secretName}" has been configured.`);
      onOpenChange(false);
    },
    onError: (error) => {
      showErrorNotification("Failed to save secret", handleApiError(error));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Secret</DialogTitle>
          <DialogDescription>
            {secretDescription || `Enter the value for the "${secretName}" secret. It will be stored securely and encrypted.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Secret Name</Label>
            <Input
              value={secretName}
              readOnly
              className="mt-1 bg-muted cursor-default"
            />
          </div>

          <div>
            <Label htmlFor="secret-value">
              Secret Value <span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="secret-value"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter secret value..."
              disabled={saveMutation.isPending}
              className="mt-1"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!value.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Secret"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
