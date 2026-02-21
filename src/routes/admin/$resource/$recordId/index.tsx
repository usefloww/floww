import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AdminRecordView } from '@/components/admin/AdminRecordView';

export const Route = createFileRoute('/admin/$resource/$recordId/')({
  component: RecordViewPage,
});

function RecordViewPage() {
  const { resource, recordId } = Route.useParams();

  const { data: meta } = useQuery({
    queryKey: ['admin', 'meta'],
    queryFn: async () => {
      const res = await fetch('/api/admin/meta');
      if (!res.ok) throw new Error('Failed to load admin metadata');
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const resourceMeta = meta?.resources?.[resource];

  if (!resourceMeta) {
    return <p className="text-muted-foreground">Resource not found.</p>;
  }

  return <AdminRecordView resourceKey={resource} recordId={recordId} resourceMeta={resourceMeta} />;
}
