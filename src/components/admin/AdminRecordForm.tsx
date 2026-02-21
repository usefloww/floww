import { useState, useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save } from 'lucide-react';

interface ColumnMeta {
  name: string;
  dataType: string;
  notNull: boolean;
  hasDefault: boolean;
  hidden: boolean;
  readOnly: boolean;
  enumValues?: string[];
}

interface ResourceMeta {
  label: string;
  actions: { create: boolean; edit: boolean; delete: boolean };
  columns: ColumnMeta[];
}

interface AdminRecordFormProps {
  resourceKey: string;
  recordId?: string;
  resourceMeta: ResourceMeta;
}

export function AdminRecordForm({ resourceKey, recordId, resourceMeta }: AdminRecordFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!recordId;
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const editableColumns = resourceMeta.columns.filter((c) => {
    if (c.hidden) return false;
    if (isEdit && c.readOnly) return false;
    if (!isEdit && (c.name === 'id' || c.name === 'key')) return false;
    return true;
  });

  const { data: existingRecord, isLoading: loadingRecord } = useQuery({
    queryKey: ['admin', resourceKey, recordId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/${resourceKey}/${recordId}`);
      if (!res.ok) throw new Error('Failed to fetch record');
      return res.json() as Promise<Record<string, any>>;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingRecord) {
      const data: Record<string, any> = {};
      for (const col of editableColumns) {
        data[col.name] = existingRecord[col.name] ?? '';
      }
      setFormData(data);
    }
  }, [existingRecord]);

  const mutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const url = isEdit
        ? `/api/admin/${resourceKey}/${recordId}`
        : `/api/admin/${resourceKey}`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', resourceKey] });
      const id = result.id ?? result.key ?? recordId;
      navigate({ to: '/admin/$resource/$recordId', params: { resource: resourceKey, recordId: String(id) } });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const processed: Record<string, any> = {};
    for (const col of editableColumns) {
      let value = formData[col.name];

      if (value === '' || value === undefined) {
        if (col.notNull && !col.hasDefault) {
          setError(`${col.name} is required`);
          return;
        }
        if (!col.notNull) {
          value = null;
        } else {
          continue;
        }
      }

      if (col.dataType === 'json' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          setError(`${col.name} must be valid JSON`);
          return;
        }
      }

      if (col.dataType === 'number' && typeof value === 'string' && value !== '') {
        value = Number(value);
      }

      if (col.dataType === 'boolean' && typeof value === 'string') {
        value = value === 'true';
      }

      processed[col.name] = value;
    }

    mutation.mutate(processed);
  };

  const updateField = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (isEdit && loadingRecord) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6 space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to={isEdit ? '/admin/$resource/$recordId' : '/admin/$resource'}
          params={isEdit ? { resource: resourceKey, recordId: recordId! } : { resource: resourceKey }}
        >
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {isEdit ? 'Edit' : 'Create'} {resourceMeta.label}
        </h2>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {editableColumns.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={col.name}>
                  {col.name}
                  {col.notNull && !col.hasDefault && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                {renderField(col, formData[col.name], (val) => updateField(col.name, val))}
              </div>
            ))}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Link
                to={isEdit ? '/admin/$resource/$recordId' : '/admin/$resource'}
                params={isEdit ? { resource: resourceKey, recordId: recordId! } : { resource: resourceKey }}
              >
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function renderField(
  col: ColumnMeta,
  value: any,
  onChange: (value: any) => void
) {
  if (col.enumValues && col.enumValues.length > 0) {
    return (
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${col.name}`} />
        </SelectTrigger>
        <SelectContent>
          {col.enumValues.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (col.dataType === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={col.name}
          checked={value === true || value === 'true'}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <Label htmlFor={col.name} className="font-normal text-muted-foreground">
          {value ? 'Enabled' : 'Disabled'}
        </Label>
      </div>
    );
  }

  if (col.dataType === 'json') {
    const displayValue = typeof value === 'object' && value !== null
      ? JSON.stringify(value, null, 2)
      : (value ?? '');
    return (
      <Textarea
        id={col.name}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs"
        rows={5}
        placeholder="Enter JSON..."
      />
    );
  }

  if (col.dataType === 'number') {
    return (
      <Input
        id={col.name}
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (col.name.toLowerCase().includes('password') || col.name.toLowerCase().includes('hash')) {
    return (
      <Input
        id={col.name}
        type="password"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (col.name.toLowerCase().includes('description') || col.name.toLowerCase().includes('message')) {
    return (
      <Textarea
        id={col.name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }

  return (
    <Input
      id={col.name}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
