import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNamespaceStore } from "@/stores/namespaceStore";
import {
  getProviderDefaultRules,
  setProviderDefaultRules,
  handleApiError,
} from "@/lib/api";
import { getProvider } from "@/lib/server/providers";
import type { PolicyRule } from "@/types/api";
import { Loader } from "@/components/Loader";
import { PolicyRuleEditor } from "@/components/PolicyRuleEditor";
import { PolicyTester } from "@/components/PolicyTester";
import { ProviderAccessContent } from "@/components/ProviderAccessManagement";
import { ProviderConfigModal } from "@/components/ProviderConfigModal";
import { DeleteProviderDialog } from "@/components/DeleteProviderDialog";
import {
  showSuccessNotification,
  showErrorNotification,
} from "@/stores/notificationStore";
import {
  ArrowLeft,
  Building2,
  Settings,
  Users,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type TabType = "policy" | "configuration" | "access" | "danger";

export const Route = createFileRoute("/providers/$providerId")({
  component: ProviderDetailPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as TabType) || "policy",
    };
  },
});

// Provider logo mapping (same as providers list)
const getProviderLogoUrl = (type: string): string | null => {
  const iconMap: Record<string, string> = {
    ai: "openai",
    aws: "amazonaws",
    gcp: "googlecloud",
    googlecloud: "googlecloud",
    azure: "microsoftazure",
    microsoftazure: "microsoftazure",
    github: "github",
    gitlab: "gitlab",
    docker: "docker",
    kubernetes: "kubernetes",
    terraform: "terraform",
    slack: "slack",
    discord: "discord",
    jenkins: "jenkins",
    circleci: "circleci",
    githubactions: "githubactions",
  };
  const iconName = iconMap[type.toLowerCase()];
  if (!iconName) return null;
  return `https://cdn.simpleicons.org/${iconName}`;
};

function ProviderDetailPage() {
  const { providerId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { currentNamespace } = useNamespaceStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>((tab || "policy") as TabType);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  // If on access tab without org, fall back to policy
  useEffect(() => {
    if (activeTab === "access" && !currentNamespace?.organization) {
      setActiveTab("policy");
    }
  }, [activeTab, currentNamespace?.organization]);

  // Fetch provider details
  const {
    data: provider,
    isLoading: providerLoading,
    error: providerError,
  } = useQuery({
    queryKey: ["provider", providerId],
    queryFn: () => getProvider({ data: { providerId } }),
  });

  // Fetch default policy rules
  const {
    data: defaultRulesData,
    isLoading: rulesLoading,
  } = useQuery({
    queryKey: ["provider-default-rules", providerId],
    queryFn: () => getProviderDefaultRules(providerId),
    enabled: !!provider,
  });

  const defaultRules: PolicyRule[] = defaultRulesData?.rules ?? [];

  // Save default rules mutation
  const saveDefaultRulesMutation = useMutation({
    mutationFn: (rules: PolicyRule[]) => setProviderDefaultRules(providerId, rules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-default-rules", providerId] });
      showSuccessNotification("Default rules updated");
    },
    onError: (err) => {
      showErrorNotification("Failed to save rules", handleApiError(err));
    },
  });

  const logoUrl = provider ? getProviderLogoUrl(provider.type) : null;
  const providerName = provider?.alias || provider?.type || "Provider";

  if (providerError) {
    return (
      <div className="space-y-6">
        <Link to="/providers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Providers
        </Link>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {handleApiError(providerError)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/providers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Providers
      </Link>

      <Loader isLoading={providerLoading} loadingMessage="Loading provider...">
        {provider && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3">
              {logoUrl && !imageError ? (
                <img
                  src={logoUrl}
                  alt={provider.type}
                  className="h-8 w-8 object-contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <h1 className="text-2xl font-bold text-foreground">{providerName}</h1>
                <span className="text-sm text-muted-foreground uppercase">{provider.type}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border">
              <nav className="-mb-px flex space-x-8">
                <Link
                  {...({
                    to: "/providers/$providerId",
                    params: { providerId },
                    search: { tab: "policy" },
                    className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === "policy"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    }`,
                  } as any)}
                  onClick={() => setActiveTab("policy")}
                >
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4" />
                    <span>Policy</span>
                  </div>
                </Link>
                <Link
                  {...({
                    to: "/providers/$providerId",
                    params: { providerId },
                    search: { tab: "configuration" },
                    className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === "configuration"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    }`,
                  } as any)}
                  onClick={() => setActiveTab("configuration")}
                >
                  <div className="flex items-center space-x-2">
                    <Settings className="h-4 w-4" />
                    <span>Configuration</span>
                  </div>
                </Link>
                {currentNamespace?.organization && (
                  <Link
                    {...({
                      to: "/providers/$providerId",
                      params: { providerId },
                      search: { tab: "access" },
                      className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === "access"
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      }`,
                    } as any)}
                    onClick={() => setActiveTab("access")}
                  >
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>Access</span>
                    </div>
                  </Link>
                )}
                <Link
                  {...({
                    to: "/providers/$providerId",
                    params: { providerId },
                    search: { tab: "danger" },
                    className: `py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === "danger"
                        ? "border-red-600 text-red-600"
                        : "border-transparent text-muted-foreground hover:text-red-600 hover:border-red-300"
                    }`,
                  } as any)}
                  onClick={() => setActiveTab("danger")}
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Danger Zone</span>
                  </div>
                </Link>
              </nav>
            </div>

            {/* Tab content */}
            <div>
              {activeTab === "policy" ? (
                <div className="space-y-6">
                  <div className="border border-border rounded-lg p-4">
                    <Loader isLoading={rulesLoading} loadingMessage="Loading rules...">
                      <PolicyRuleEditor
                        rules={defaultRules}
                        onSave={(rules) => saveDefaultRulesMutation.mutate(rules)}
                        isSaving={saveDefaultRulesMutation.isPending}
                        title="Default Policy Rules"
                        description="Rules applied to all workflows using this provider, unless overridden by grant-level rules."
                      />
                    </Loader>
                  </div>
                  <PolicyTester providerId={providerId} />
                </div>
              ) : activeTab === "configuration" ? (
                <div className="border border-border rounded-lg p-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">Type</span>
                        <p className="text-sm font-medium text-foreground uppercase">{provider.type}</p>
                      </div>
                      {provider.alias && (
                        <div>
                          <span className="text-sm text-muted-foreground">Alias</span>
                          <p className="text-sm font-medium text-foreground">{provider.alias}</p>
                        </div>
                      )}
                    </div>
                    <Button onClick={() => setConfigModalOpen(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Open Configuration
                    </Button>
                  </div>
                </div>
              ) : activeTab === "access" && currentNamespace?.organization ? (
                <ProviderAccessContent
                  providerId={providerId}
                  organizationId={currentNamespace.organization.id}
                />
              ) : activeTab === "danger" ? (
                <div className="border border-red-200 dark:border-red-800/50 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-red-600">Delete Provider</h3>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete this provider and all its associated configuration, access grants, and policy rules. This action cannot be undone.
                      </p>
                      <Button
                        variant="destructive"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        Delete Provider
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modals */}
            {currentNamespace && (
              <>
                <ProviderConfigModal
                  open={configModalOpen}
                  onOpenChange={setConfigModalOpen}
                  provider={provider as any}
                  namespaceId={currentNamespace.id}
                />
                <DeleteProviderDialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                  provider={provider as any}
                  namespaceId={currentNamespace.id}
                />
              </>
            )}
          </>
        )}
      </Loader>
    </div>
  );
}
