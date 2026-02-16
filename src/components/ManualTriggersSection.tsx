import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getManualTriggers, ManualTriggerInfo } from "@/lib/api";
import { Loader } from "./Loader";
import { ManualTriggerCard } from "./ManualTriggerCard";
import { ManualTriggerInvokeModal } from "./ManualTriggerInvokeModal";
import { AlertCircle } from "lucide-react";

interface ManualTriggersSectionProps {
  workflowId: string;
}

export function ManualTriggersSection({ workflowId }: ManualTriggersSectionProps) {
  const [selectedTrigger, setSelectedTrigger] = useState<ManualTriggerInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["manual-triggers", workflowId],
    queryFn: async () => {
      return await getManualTriggers(workflowId);
    },
  });

  const handleInvoke = (trigger: ManualTriggerInfo) => {
    setSelectedTrigger(trigger);
    setIsModalOpen(true);
  };

  const handleSuccess = () => {
    // Refetch to update execution counts
    refetch();
  };

  if (isLoading) {
    return (
      <Loader isLoading={true} loadingMessage="Loading manual triggers...">
        <div />
      </Loader>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-950/30">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-800 dark:text-red-200">
              Failed to load manual triggers
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {error instanceof Error ? error.message : "An unknown error occurred"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const triggers = data?.triggers || [];

  if (triggers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
        <div className="mx-auto max-w-md space-y-3">
          <h3 className="text-lg font-semibold">No Manual Triggers</h3>
          <p className="text-sm text-muted-foreground">
            This workflow doesn't have any manual triggers defined yet. To add a manual
            trigger, define one in your workflow code using{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              builtin.triggers.onManual()
            </code>{" "}
            and deploy the workflow.
          </p>
          <div className="pt-4">
            <pre className="text-left rounded-lg bg-secondary p-4 text-xs overflow-x-auto">
              <code>{`builtin.triggers.onManual({
  name: "Process Data",
  description: "Manually process data",
  inputSchema: {
    type: "object",
    properties: {
      userId: { type: "string" }
    },
    required: ["userId"]
  },
  handler: async (ctx, event) => {
    // Your code here
  }
});`}</code>
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Manual Triggers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Run triggers manually with custom input parameters
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {triggers.map((trigger) => (
          <ManualTriggerCard
            key={trigger.id}
            trigger={trigger}
            onInvoke={handleInvoke}
          />
        ))}
      </div>

      <ManualTriggerInvokeModal
        trigger={selectedTrigger}
        workflowId={workflowId}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
