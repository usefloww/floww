import { createFileRoute } from '@tanstack/react-router';
import { PersonalInfoCard } from '@/components/profile/PersonalInfoCard';

export const Route = createFileRoute('/profile/')({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your personal information
        </p>
      </div>

      <div className="space-y-6">
        <PersonalInfoCard user={user!} />
      </div>
    </div>
  );
}
