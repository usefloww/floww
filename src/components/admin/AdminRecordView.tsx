import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface ColumnMeta {
  name: string;
  dataType: string;
  hidden: boolean;
  readOnly: boolean;
  enumValues?: string[];
}

interface ResourceMeta {
  label: string;
  actions: { create: boolean; edit: boolean; delete: boolean };
  columns: ColumnMeta[];
}

interface AdminRecordViewProps {
  resourceKey: string;
  recordId: string;
  resourceMeta: ResourceMeta;
}

function formatValue(value: unknown, dataType: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
  }
  if (dataType === 'json' || typeof value === 'object') {
    return (
      <pre className="font-mono text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

export function AdminRecordView({ resourceKey, recordId, resourceMeta }: AdminRecordViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: record, isLoading } = useQuery({
    queryKey: ['admin', resourceKey, recordId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/${resourceKey}/${recordId}`);
      if (!res.ok) throw new Error('Failed to fetch record');
      return res.json() as Promise<Record<string, any>>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/${resourceKey}/${recordId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete record');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', resourceKey] });
      navigate({ to: '/admin/$resource', params: { resource: resourceKey } });
    },
  });

  const visibleColumns = resourceMeta.columns.filter((c) => !c.hidden);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-64" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!record) {
    return <p className="text-muted-foreground">Record not found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/$resource" params={{ resource: resourceKey }}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{resourceMeta.label}</h2>
            <p className="text-sm text-muted-foreground font-mono">{recordId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {resourceMeta.actions.edit && (
            <Link to="/admin/$resource/$recordId/edit" params={{ resource: resourceKey, recordId }}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </Link>
          )}
          {resourceMeta.actions.delete && (
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete record</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this record? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {visibleColumns.map((col, idx) => (
              <div key={col.name}>
                {idx > 0 && <Separator className="mb-4" />}
                <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
                  <span className="text-sm font-medium text-muted-foreground">{col.name}</span>
                  <div className="text-sm text-foreground break-all">
                    {formatValue(record[col.name], col.dataType)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
