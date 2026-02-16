import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/api";
import {
  getServiceAccounts,
  deleteServiceAccount,
  revokeApiKey,
  type ServiceAccountInfo,
  type ApiKeyInfo,
} from "@/lib/server/serviceAccounts";
import { Loader } from "@/components/Loader";
import { Key, Plus, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateServiceAccountModal } from "@/components/CreateServiceAccountModal";
import { CreateApiKeyModal } from "@/components/CreateApiKeyModal";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";

interface ServiceAccountsManagementProps {
  organizationId: string;
}

export function ServiceAccountsManagement({ organizationId }: ServiceAccountsManagementProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createApiKeyModalState, setCreateApiKeyModalState] = useState<{
    open: boolean;
    serviceAccountId: string;
  } | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['service-accounts', organizationId],
    queryFn: async () => {
      const result = await getServiceAccounts({ data: { organizationId } });
      return result.results || [];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ serviceAccountId, apiKeyId }: { serviceAccountId: string; apiKeyId: string }) => {
      return await revokeApiKey({ data: { serviceAccountId, apiKeyId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-accounts', organizationId] });
      showSuccessNotification("API key revoked", "The API key has been revoked successfully.");
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to revoke API key", errorMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (serviceAccountId: string) => {
      return await deleteServiceAccount({ data: { serviceAccountId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-accounts', organizationId] });
      showSuccessNotification("Service account deleted", "The service account has been deleted successfully.");
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to delete service account", errorMessage);
    },
  });

  const serviceAccounts: ServiceAccountInfo[] = data || [];
  const errorMessage = error ? handleApiError(error) : null;

  const isApiKeyRevoked = (apiKey: ApiKeyInfo) => {
    return apiKey.revokedAt !== null && apiKey.revokedAt !== undefined;
  };

  const handleRevokeApiKey = (serviceAccountId: string, apiKeyId: string) => {
    if (confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      revokeMutation.mutate({ serviceAccountId, apiKeyId });
    }
  };

  const handleDeleteServiceAccount = (serviceAccountId: string) => {
    if (confirm("Are you sure you want to delete this service account? This will also delete all associated API keys. This action cannot be undone.")) {
      deleteMutation.mutate(serviceAccountId);
    }
  };

  return (
    <>
      <Loader isLoading={isLoading} loadingMessage="Loading service accounts...">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Key className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Service Accounts</h2>
              <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
                {serviceAccounts.length} account{serviceAccounts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Service Account
            </Button>
          </div>

          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
              {errorMessage}
            </div>
          )}

          {serviceAccounts.length === 0 ? (
            <div className="text-center py-8">
              <Key className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No service accounts</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a service account to generate API keys for programmatic access.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {serviceAccounts.map((serviceAccount) => (
                <div
                  key={serviceAccount.id}
                  className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-semibold text-lg text-foreground">
                          {serviceAccount.name}
                        </h3>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {serviceAccount.apiKeys.length} key{serviceAccount.apiKeys.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ID: {serviceAccount.id}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() =>
                          setCreateApiKeyModalState({
                            open: true,
                            serviceAccountId: serviceAccount.id,
                          })
                        }
                        variant="outline"
                        size="sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create API Key
                      </Button>
                      <Button
                        onClick={() => handleDeleteServiceAccount(serviceAccount.id)}
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {serviceAccount.apiKeys.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">
                      No API keys created yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground mb-2">API Keys:</div>
                      {serviceAccount.apiKeys.map((apiKey) => (
                        <div
                          key={apiKey.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isApiKeyRevoked(apiKey)
                              ? "bg-muted border-border opacity-60"
                              : "bg-muted border-border"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm text-foreground">
                                {apiKey.name}
                              </span>
                              {isApiKeyRevoked(apiKey) && (
                                <span className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded">
                                  Revoked
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-4 mt-1 text-xs text-muted-foreground">
                              <span className="font-mono">{apiKey.prefix}••••••••</span>
                              <div className="flex items-center space-x-1">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  Created {new Date(apiKey.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              {apiKey.lastUsedAt && (
                                <span>
                                  Last used {new Date(apiKey.lastUsedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {!isApiKeyRevoked(apiKey) && (
                            <Button
                              onClick={() =>
                                handleRevokeApiKey(serviceAccount.id, apiKey.id)
                              }
                              variant="outline"
                              size="sm"
                              disabled={revokeMutation.isPending}
                              className="ml-4"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Loader>

      <CreateServiceAccountModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        organizationId={organizationId}
      />

      {createApiKeyModalState && (
        <CreateApiKeyModal
          open={createApiKeyModalState.open}
          onOpenChange={(open) => {
            if (!open) {
              setCreateApiKeyModalState(null);
            }
          }}
          serviceAccountId={createApiKeyModalState.serviceAccountId}
          organizationId={organizationId}
        />
      )}
    </>
  );
}

