import { useState, useEffect, useId } from "react";
import type { PolicyRule } from "@/types/api";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Shield,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PolicyRuleEditorProps {
  rules: PolicyRule[];
  onSave: (rules: PolicyRule[]) => void;
  isSaving: boolean;
  title?: string;
  description?: string;
}

type ConstraintType = "in" | "notIn" | "eq" | "pattern" | "startsWith";

interface ConstraintRow {
  id: string;
  param: string;
  type: ConstraintType;
  value: string;
}

interface RuleFormData {
  effect: "ALLOW" | "DENY";
  action: string;
  description: string;
  constraints: ConstraintRow[];
}

function makeConstraintId() {
  return Math.random().toString(36).slice(2, 9);
}

function ruleToForm(rule: PolicyRule): RuleFormData {
  const constraints: ConstraintRow[] = [];
  if (rule.parameterConstraints) {
    for (const [param, constraint] of Object.entries(rule.parameterConstraints)) {
      if (constraint.in) {
        constraints.push({ id: makeConstraintId(), param, type: "in", value: constraint.in.map(String).join(", ") });
      } else if (constraint.notIn) {
        constraints.push({ id: makeConstraintId(), param, type: "notIn", value: constraint.notIn.map(String).join(", ") });
      } else if (constraint.eq !== undefined) {
        constraints.push({ id: makeConstraintId(), param, type: "eq", value: String(constraint.eq) });
      } else if (constraint.pattern) {
        constraints.push({ id: makeConstraintId(), param, type: "pattern", value: constraint.pattern });
      } else if (constraint.startsWith) {
        constraints.push({ id: makeConstraintId(), param, type: "startsWith", value: constraint.startsWith });
      }
    }
  }
  return {
    effect: rule.effect,
    action: rule.action ?? "",
    description: rule.description ?? "",
    constraints,
  };
}

function formToRule(form: RuleFormData): PolicyRule {
  const rule: PolicyRule = {
    effect: form.effect,
    action: form.action.trim() || null,
  };
  if (form.description.trim()) {
    rule.description = form.description.trim();
  }
  if (form.constraints.length > 0) {
    const parameterConstraints: Record<string, any> = {};
    for (const c of form.constraints) {
      if (!c.param.trim()) continue;
      const key = c.param.trim();
      if (c.type === "in" || c.type === "notIn") {
        parameterConstraints[key] = {
          [c.type]: c.value.split(",").map((v) => v.trim()).filter(Boolean),
        };
      } else if (c.type === "eq") {
        parameterConstraints[key] = { eq: c.value.trim() };
      } else {
        parameterConstraints[key] = { [c.type]: c.value.trim() };
      }
    }
    if (Object.keys(parameterConstraints).length > 0) {
      rule.parameterConstraints = parameterConstraints;
    }
  }
  return rule;
}

function constraintSummary(rule: PolicyRule): string | null {
  if (!rule.parameterConstraints) return null;
  const parts: string[] = [];
  for (const [param, constraint] of Object.entries(rule.parameterConstraints)) {
    if (constraint.in) {
      parts.push(`${param} IN [${constraint.in.map(String).join(", ")}]`);
    } else if (constraint.notIn) {
      parts.push(`${param} NOT IN [${constraint.notIn.map(String).join(", ")}]`);
    } else if (constraint.eq !== undefined) {
      parts.push(`${param} = ${String(constraint.eq)}`);
    } else if (constraint.pattern) {
      parts.push(`${param} ~ ${constraint.pattern}`);
    } else if (constraint.startsWith) {
      parts.push(`${param} starts with "${constraint.startsWith}"`);
    }
  }
  return parts.length > 0 ? `where ${parts.join(", ")}` : null;
}

// --- Sortable Rule Card ---

interface SortableRuleCardProps {
  rule: PolicyRule;
  ruleId: string;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableRuleCard({ rule, ruleId, onEdit, onDelete }: SortableRuleCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ruleId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const summary = constraintSummary(rule);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors group"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${
          rule.effect === "ALLOW"
            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
            : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
        }`}
      >
        {rule.effect}
      </span>

      <span className="font-mono text-sm text-foreground">
        {rule.action ?? "*"}
      </span>

      {summary && (
        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
          {summary}
        </span>
      )}

      {rule.description && (
        <span className="text-xs text-muted-foreground italic truncate max-w-[200px] ml-auto mr-2">
          {rule.description}
        </span>
      )}

      <div className="flex items-center gap-1 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// --- Rule Edit Dialog ---

interface RuleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: RuleFormData;
  onSubmit: (data: RuleFormData) => void;
  isNew: boolean;
}

function RuleEditDialog({ open, onOpenChange, initialData, onSubmit, isNew }: RuleEditDialogProps) {
  const [form, setForm] = useState<RuleFormData>(
    initialData ?? { effect: "ALLOW", action: "", description: "", constraints: [] }
  );

  useEffect(() => {
    if (open) {
      setForm(initialData ?? { effect: "ALLOW", action: "", description: "", constraints: [] });
    }
  }, [open, initialData]);

  const updateField = <K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addConstraint = () => {
    setForm((prev) => ({
      ...prev,
      constraints: [...prev.constraints, { id: makeConstraintId(), param: "", type: "eq" as ConstraintType, value: "" }],
    }));
  };

  const updateConstraint = (id: string, field: keyof ConstraintRow, value: string) => {
    setForm((prev) => ({
      ...prev,
      constraints: prev.constraints.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  };

  const removeConstraint = (id: string) => {
    setForm((prev) => ({
      ...prev,
      constraints: prev.constraints.filter((c) => c.id !== id),
    }));
  };

  const handleSubmit = () => {
    onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Rule" : "Edit Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Effect</Label>
            <Select value={form.effect} onValueChange={(v) => updateField("effect", v as "ALLOW" | "DENY")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALLOW">ALLOW</SelectItem>
                <SelectItem value="DENY">DENY</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Action</Label>
            <Input
              value={form.action}
              onChange={(e) => updateField("action", e.target.value)}
              placeholder="Leave empty for wildcard (*)"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Parameter Constraints</Label>
              <Button variant="outline" size="sm" onClick={addConstraint}>
                <Plus className="h-3 w-3 mr-1" />
                Add Constraint
              </Button>
            </div>
            {form.constraints.length === 0 && (
              <p className="text-xs text-muted-foreground">No constraints. Rule applies to all parameters.</p>
            )}
            <div className="space-y-2">
              {form.constraints.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Input
                    className="w-28"
                    placeholder="param"
                    value={c.param}
                    onChange={(e) => updateConstraint(c.id, "param", e.target.value)}
                  />
                  <Select value={c.type} onValueChange={(v) => updateConstraint(c.id, "type", v)}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">equals</SelectItem>
                      <SelectItem value="in">in</SelectItem>
                      <SelectItem value="notIn">not in</SelectItem>
                      <SelectItem value="pattern">pattern</SelectItem>
                      <SelectItem value="startsWith">starts with</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder={c.type === "in" || c.type === "notIn" ? "comma-separated values" : "value"}
                    value={c.value}
                    onChange={(e) => updateConstraint(c.id, "value", e.target.value)}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeConstraint(c.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {isNew ? "Add Rule" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Component ---

export function PolicyRuleEditor({
  rules: savedRules,
  onSave,
  isSaving,
  title = "Policy Rules",
  description,
}: PolicyRuleEditorProps) {
  const dndId = useId();
  const [localRules, setLocalRules] = useState<PolicyRule[]>(savedRules);
  const [ruleIds, setRuleIds] = useState<string[]>(() => savedRules.map((_, i) => `rule-${i}`));
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingForm, setEditingForm] = useState<RuleFormData | undefined>();

  // Sync from parent when saved rules change
  useEffect(() => {
    setLocalRules(savedRules);
    setRuleIds(savedRules.map((_, i) => `rule-${i}`));
  }, [savedRules]);

  const hasChanges = JSON.stringify(localRules) !== JSON.stringify(savedRules);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = ruleIds.indexOf(String(active.id));
      const newIndex = ruleIds.indexOf(String(over.id));
      setLocalRules((prev) => arrayMove(prev, oldIndex, newIndex));
      setRuleIds((prev) => arrayMove(prev, oldIndex, newIndex));
    }
  };

  const handleAdd = () => {
    setEditingIndex(null);
    setEditingForm(undefined);
    setEditDialogOpen(true);
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingForm(ruleToForm(localRules[index]));
    setEditDialogOpen(true);
  };

  const handleDelete = (index: number) => {
    setLocalRules((prev) => prev.filter((_, i) => i !== index));
    setRuleIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDialogSubmit = (data: RuleFormData) => {
    const rule = formToRule(data);
    if (editingIndex !== null) {
      setLocalRules((prev) => prev.map((r, i) => (i === editingIndex ? rule : r)));
    } else {
      setLocalRules((prev) => [...prev, rule]);
      setRuleIds((prev) => [...prev, `rule-${Date.now()}`]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {title}
            {localRules.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                ({localRules.length} rule{localRules.length !== 1 ? "s" : ""})
              </span>
            )}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Rule
        </Button>
      </div>

      {localRules.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg">
          <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No rules configured. All actions are allowed.
          </p>
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ruleIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {localRules.map((rule, index) => (
                <SortableRuleCard
                  key={ruleIds[index]}
                  ruleId={ruleIds[index]}
                  rule={rule}
                  onEdit={() => handleEdit(index)}
                  onDelete={() => handleDelete(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={() => onSave(localRules)} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Rules"}
          </Button>
        </div>
      )}

      <RuleEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        initialData={editingForm}
        onSubmit={handleDialogSubmit}
        isNew={editingIndex === null}
      />
    </div>
  );
}
