import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
});

function AdminIndex() {
  return <Navigate to="/admin/$resource" params={{ resource: 'users' }} />;
}
