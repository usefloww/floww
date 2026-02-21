import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AdminRecordForm } from '@/components/admin/AdminRecordForm';

export const Route = createFileRoute('/admin/$resource/new')({
  component: NewRecordPage,
});

function NewRecordPage() {
  const { resource } = Route.useParams();

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

  return <AdminRecordForm resourceKey={resource} resourceMeta={resourceMeta} />;
}
