import { Link, useParams } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import {
  User,
  Users,
  Building,
  Activity,
  Upload,
  Zap,
  PlayCircle,
  FileText,
  Server,
  Folder,
  Key,
  Lock,
  CreditCard,
  Box,
  Shield,
  ArrowLeft,
  Workflow,
  Settings,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  User,
  Users,
  Building,
  Activity,
  Upload,
  Zap,
  PlayCircle,
  FileText,
  Server,
  Folder,
  Key,
  Lock,
  CreditCard,
  Box,
  Shield,
  Workflow,
  Settings,
};

interface NavigationGroup {
  name: string;
  icon: string;
  resources: { key: string; label: string; icon: string }[];
}

interface AdminSidebarProps {
  navigation: NavigationGroup[];
}

export function AdminSidebar({ navigation }: AdminSidebarProps) {
  const params = useParams({ strict: false }) as { resource?: string };
  const currentResource = params.resource;

  return (
    <div className="flex h-screen w-64 flex-col bg-card border-r border-border">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Admin Panel</h1>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>
      </div>

      <Separator />

      <nav className="flex-1 overflow-auto p-4 space-y-6">
        {navigation.map((group) => {
          const GroupIcon = iconMap[group.icon] || Activity;
          return (
            <div key={group.name}>
              <div className="flex items-center gap-2 mb-2 px-2">
                <GroupIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.resources.map((resource) => {
                  const Icon = iconMap[resource.icon] || Activity;
                  const isActive = currentResource === resource.key;
                  return (
                    <Link
                      key={resource.key}
                      to="/admin/$resource"
                      params={{ resource: resource.key }}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {resource.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
