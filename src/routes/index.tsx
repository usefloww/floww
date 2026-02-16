import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BaseCard } from "@/components/BaseCard";
import { ExecutionChart } from "@/components/ExecutionChart";
import { useNamespaceStore } from "@/stores/namespaceStore";
import { getSummary } from "@/lib/server/summary";

interface NavigationItem {
  name: string;
  description: string;
  to: string;
  params?: Record<string, string>;
}

const navigationItems: NavigationItem[] = [
  {
    name: "Workflows",
    description: "View and manage your workflows across all organizations",
    to: "/workflows",
  },
  {
    name: "Providers",
    description: "Connect and manage your cloud providers and services",
    to: "/providers",
  },
  {
    name: "Organization Settings",
    description: "Configure your organization, users, and application preferences",
    to: "/settings",
  },
];

function NavigationCard({ item }: { item: NavigationItem }) {
  return (
    <BaseCard to={item.to as any} params={item.params as any}>
      <h2 className="text-2xl font-bold text-foreground">{item.name}</h2>
      <p className="text-muted-foreground text-sm">{item.description}</p>
    </BaseCard>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { currentNamespace } = useNamespaceStore();

  // Fetch summary data when namespace is available
  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ["summary", currentNamespace?.id],
    queryFn: () => {
      if (!currentNamespace?.id) {
        throw new Error('Namespace ID is required');
      }
      return getSummary({ data: { namespaceId: currentNamespace.id } });
    },
    enabled: !!currentNamespace?.id,
  });

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Overview</h1>
      </div>

      {/* Chart Section */}
      {currentNamespace && (
        <div className="mb-12">
          <ExecutionChart
            data={summaryData}
            isLoading={isLoading}
            error={error as Error | null}
          />
        </div>
      )}

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {navigationItems.map((item) => (
          <NavigationCard key={item.name} item={item} />
        ))}
      </div>
    </div>
  );
}
