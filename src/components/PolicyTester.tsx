import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNamespaceStore } from "@/stores/namespaceStore";
import { getWorkflows } from "@/lib/server/workflows";
import { evaluatePolicy, handleApiError } from "@/lib/api";
import type { PolicyRule } from "@/types/api";
import {
  FlaskConical,
  ChevronDown,
  ChevronUp,
  Check,
  Ban,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface PolicyTesterProps {
  providerId: string;
}

interface EvaluationResult {
  decision: string;
  matchedRule: PolicyRule | null;
  chainEvaluated: PolicyRule[];
}

export function PolicyTester({ providerId }: PolicyTesterProps) {
  const { currentNamespace } = useNamespaceStore();
  const [expanded, setExpanded] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [action, setAction] = useState("");
  const [paramsText, setParamsText] = useState("{}");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: workflows } = useQuery({
    queryKey: ["workflows", currentNamespace?.id],
    queryFn: () => getWorkflows({ data: { namespaceId: currentNamespace?.id } }),
    enabled: expanded && !!currentNamespace?.id,
  });

  const workflowList = workflows?.results ?? [];

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      let parameters: Record<string, unknown> = {};
      try {
        parameters = JSON.parse(paramsText);
      } catch {
        throw new Error("Invalid JSON in parameters");
      }
      return evaluatePolicy({
        workflowId,
        providerId,
        action,
        parameters,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err) => {
      setError(handleApiError(err));
      setResult(null);
    },
  });

  return (
    <div className="border border-border rounded-lg">
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm font-medium flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Policy Tester
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Workflow</Label>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a workflow..." />
                </SelectTrigger>
                <SelectContent>
                  {workflowList.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Action</Label>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="e.g., sendMessage"
              />
            </div>
          </div>

          <div>
            <Label>Parameters (JSON)</Label>
            <Textarea
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
              placeholder='{"channel": "#general"}'
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <Button
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending || !workflowId || !action}
          >
            {evaluateMutation.isPending ? "Evaluating..." : "Evaluate"}
          </Button>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {/* Decision */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  result.decision === "ALLOWED"
                    ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                {result.decision === "ALLOWED" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {result.decision}
              </div>

              {/* Matched Rule */}
              {result.matchedRule && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Matched rule:</span>{" "}
                  <span
                    className={
                      result.matchedRule.effect === "ALLOW"
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    {result.matchedRule.effect}
                  </span>{" "}
                  {result.matchedRule.action ?? "*"}
                  {result.matchedRule.description && (
                    <span className="italic"> — {result.matchedRule.description}</span>
                  )}
                </div>
              )}

              {/* Chain visualization */}
              {result.chainEvaluated.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Rule chain evaluated:
                  </p>
                  <div className="space-y-1">
                    {result.chainEvaluated.map((rule, i) => {
                      const isMatch =
                        result.matchedRule &&
                        rule.effect === result.matchedRule.effect &&
                        rule.action === result.matchedRule.action &&
                        rule.description === result.matchedRule.description;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                            isMatch
                              ? "bg-primary/10 border border-primary/20"
                              : "text-muted-foreground"
                          }`}
                        >
                          <Shield className="h-3 w-3 shrink-0" />
                          <span
                            className={`font-mono ${
                              rule.effect === "ALLOW"
                                ? "text-green-700 dark:text-green-400"
                                : "text-red-700 dark:text-red-400"
                            }`}
                          >
                            {rule.effect}
                          </span>
                          <span className="font-mono">{rule.action ?? "*"}</span>
                          {rule.description && (
                            <span className="italic text-muted-foreground">
                              {rule.description}
                            </span>
                          )}
                          {isMatch && (
                            <span className="ml-auto text-xs font-medium text-primary">
                              matched
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
