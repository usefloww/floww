import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { ManualTriggerInfo, invokeManualTrigger } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface ManualTriggerInvokeModalProps {
  trigger: ManualTriggerInfo | null;
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (executionId: string) => void;
}

export function ManualTriggerInvokeModal({
  trigger,
  workflowId,
  open,
  onOpenChange,
  onSuccess,
}: ManualTriggerInvokeModalProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!trigger) return null;

  const schema = trigger.inputSchema;
  const properties = schema?.properties || {};
  const required = schema?.required || [];

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Check required fields
    required.forEach((field: string) => {
      if (
        formData[field] === undefined ||
        formData[field] === null ||
        formData[field] === ""
      ) {
        newErrors[field] = "This field is required";
      }
    });

    // Basic type validation
    Object.entries(properties).forEach(([field, fieldSchema]: [string, any]) => {
      const value = formData[field];
      if (value !== undefined && value !== null && value !== "") {
        if (fieldSchema.type === "number" && isNaN(Number(value))) {
          newErrors[field] = "Must be a valid number";
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert string values to appropriate types
      const processedData: Record<string, any> = {};
      Object.entries(formData).forEach(([field, value]) => {
        const fieldSchema = properties[field];
        if (fieldSchema) {
          if (fieldSchema.type === "number") {
            processedData[field] = Number(value);
          } else if (fieldSchema.type === "boolean") {
            processedData[field] = Boolean(value);
          } else {
            processedData[field] = value;
          }
        }
      });

      const result = await invokeManualTrigger(trigger.id, processedData);

      onOpenChange(false);
      setFormData({});

      if (onSuccess) {
        onSuccess(result.executionId);
      } else {
        // Navigate to execution details
        navigate({
          to: "/workflows/$workflowId/executions/$executionId",
          params: { workflowId, executionId: result.executionId },
        });
      }
    } catch (error: any) {
      setSubmitError(error.message || "Failed to invoke trigger");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: string, fieldSchema: any) => {
    const value = formData[field] ?? fieldSchema.default ?? "";
    const isRequired = required.includes(field);
    const error = errors[field];

    if (fieldSchema.enum && Array.isArray(fieldSchema.enum)) {
      // Enum field - use select
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>
            {fieldSchema.description || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <select
            id={field}
            value={value}
            onChange={(e) => handleInputChange(field, e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select an option</option>
            {fieldSchema.enum.map((option: string) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      );
    }

    if (fieldSchema.type === "boolean") {
      // Boolean field - use checkbox
      return (
        <div key={field} className="flex items-center space-x-2">
          <Checkbox
            id={field}
            checked={value}
            onCheckedChange={(checked) => handleInputChange(field, checked)}
          />
          <Label htmlFor={field} className="cursor-pointer">
            {fieldSchema.description || field}
          </Label>
        </div>
      );
    }

    // String or number field - use input
    const inputType =
      fieldSchema.type === "number"
        ? "number"
        : fieldSchema.type === "integer"
        ? "number"
        : "text";

    return (
      <div key={field} className="space-y-2">
        <Label htmlFor={field}>
          {fieldSchema.description || field}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          id={field}
          type={inputType}
          value={value}
          onChange={(e) => handleInputChange(field, e.target.value)}
          placeholder={fieldSchema.description || field}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Run {trigger.name}</DialogTitle>
          <DialogDescription>
            {trigger.description || "Enter the input parameters to run this trigger."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {Object.keys(properties).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This trigger does not require any input parameters.
            </p>
          ) : (
            Object.entries(properties).map(([field, fieldSchema]: [string, any]) =>
              renderField(field, fieldSchema)
            )
          )}

          {submitError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
              {submitError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              "Run Trigger"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
