import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser } from '@/lib/server/auth';

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user || !user.isAdmin) {
      throw redirect({ to: '/' });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { data: meta, isLoading } = useQuery({
    queryKey: ['admin', 'meta'],
    queryFn: async () => {
      const res = await fetch('/api/admin/meta');
      if (!res.ok) throw new Error('Failed to load admin metadata');
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <div className="w-64 bg-card border-r border-border p-4 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <AdminSidebar navigation={meta?.navigation ?? []} />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
