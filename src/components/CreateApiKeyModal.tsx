import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/api";
import { createApiKey } from "@/lib/server/serviceAccounts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";

interface CreateApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceAccountId: string;
  organizationId: string;
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  serviceAccountId,
  organizationId,
}: CreateApiKeyModalProps) {
  const [name, setName] = useState("");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return await createApiKey({ data: { serviceAccountId, name: data.name } });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['service-accounts', organizationId] });
      setCreatedApiKey(data.apiKey);
      showSuccessNotification("API key created", "Make sure to copy the key now - it won't be shown again.");
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      setError(errorMessage);
      showErrorNotification("Failed to create API key", errorMessage);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    createMutation.mutate({
      name: name.trim(),
    });
  };

  const handleCopy = async () => {
    if (!createdApiKey) return;

    try {
      await navigator.clipboard.writeText(createdApiKey);
      setCopied(true);
      showSuccessNotification("Copied!", "API key copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showErrorNotification("Failed to copy", "Could not copy to clipboard. Please copy manually.");
    }
  };

  const handleClose = () => {
    setName("");
    setCreatedApiKey(null);
    setCopied(false);
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for this service account. You'll be able to copy it once - make sure to save it securely.
          </DialogDescription>
        </DialogHeader>

        {createdApiKey ? (
          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/50 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                ⚠️ Important: Copy this key now
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                This is the only time you'll be able to see the full API key. Make sure to copy it and store it securely.
              </p>
            </div>

            <div>
              <Label>API Key</Label>
              <div className="mt-1 flex items-center space-x-2">
                <Input
                  type="text"
                  value={createdApiKey}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Key Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production API Key"
                disabled={createMutation.isPending}
                className="mt-1"
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Give this key a descriptive name to help you identify it later.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-3 rounded-md">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create API Key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

