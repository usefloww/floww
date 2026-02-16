import { PlayIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { ManualTriggerInfo } from "@/lib/api";

interface ManualTriggerCardProps {
  trigger: ManualTriggerInfo;
  onInvoke: (trigger: ManualTriggerInfo) => void;
}

export function ManualTriggerCard({ trigger, onInvoke }: ManualTriggerCardProps) {
  return (
    <Card className="p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="text-lg font-semibold">{trigger.name}</h3>
            {trigger.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {trigger.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {trigger.executionCount} execution{trigger.executionCount !== 1 ? 's' : ''}
            </span>
            {trigger.inputSchema && (
              <span className="text-xs bg-secondary px-2 py-1 rounded">
                Has input parameters
              </span>
            )}
          </div>
        </div>

        <Button
          onClick={() => onInvoke(trigger)}
          size="default"
          className="ml-4"
        >
          <PlayIcon className="h-4 w-4 mr-2" />
          Run
        </Button>
      </div>
    </Card>
  );
}
