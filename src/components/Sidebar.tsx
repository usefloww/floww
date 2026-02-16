import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useNamespaceStore, Namespace } from "@/stores/namespaceStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useTheme } from "@/hooks/useTheme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Workflow,
  Settings,
  Building2,
  ChevronDown,
  Plus,
  LogOut,
  UserCircle,
  Monitor,
  Moon,
  Sun,
  Palette,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

interface NavigationItem {
  name: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navigationItems: NavigationItem[] = [
  { name: "Overview", to: "/", icon: LayoutDashboard },
  { name: "Workflows", to: "/workflows", icon: Workflow },
  { name: "Providers", to: "/providers", icon: Building2 },
  { name: "Settings", to: "/settings", icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const {
    namespaces,
    currentNamespace,
    setCurrentNamespace,
    createNamespace,
    fetchNamespaces,
    isLoading
  } = useNamespaceStore();
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ displayName: "" });
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    fetchNamespaces();
  }, [fetchNamespaces]);

  const handleWorkspaceSelect = (namespace: Namespace) => {
    setCurrentNamespace(namespace);
    setIsWorkspaceDropdownOpen(false);
  };

  const handleCreateNamespace = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!formData.displayName.trim()) {
      setCreateError("Organization name is required");
      return;
    }

    try {
      await createNamespace({ displayName: formData.displayName });
      setFormData({ displayName: "" });
      setIsCreateDialogOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create organization");
    }
  };

  const getUserInitials = () => {
    if (!user) return "U";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) return user.firstName.substring(0, 2).toUpperCase();
    if (user.lastName) return user.lastName.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return (user.workosUserId || user.id).substring(0, 2).toUpperCase();
  };

  const currentDisplayName = currentNamespace?.organization.displayName || "Select Workspace";

  return (
    <div 
      className={cn(
        "flex h-screen flex-col bg-card border-r border-border transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* User Section */}
      <div className={cn("border-b border-border", isCollapsed ? "p-3" : "p-6")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="w-full flex items-center justify-center hover:bg-muted rounded-md p-2 transition-colors">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.firstName || user?.lastName || user?.email || "User"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button className="w-full flex items-center space-x-3 hover:bg-muted rounded-md p-2 -m-2 transition-colors">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user?.firstName && user?.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user?.firstName || user?.lastName || user?.email || "User"}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
              <UserCircle className="h-4 w-4 mr-2" />
              Manage Profile
            </DropdownMenuItem>
            <div className="px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  <span className="text-sm">Theme</span>
                </div>
                <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setTheme('light')}
                        className={cn(
                          "flex items-center justify-center p-1.5 rounded transition-colors",
                          theme === 'light'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Sun className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Light</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setTheme('dark')}
                        className={cn(
                          "flex items-center justify-center p-1.5 rounded transition-colors",
                          theme === 'dark'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Moon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Dark</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setTheme('system')}
                        className={cn(
                          "flex items-center justify-center p-1.5 rounded transition-colors",
                          theme === 'system'
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Monitor className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>System</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
            <DropdownMenuItem onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Workspace Switcher */}
      <div className={cn("border-b border-border", isCollapsed ? "p-2" : "p-4")}>
        <div className="relative">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
                  className="w-full flex items-center justify-center p-2 text-sm bg-muted border border-border rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{currentDisplayName}</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm bg-muted border border-border rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="flex items-center space-x-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground truncate">{currentDisplayName}</span>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isWorkspaceDropdownOpen && "transform rotate-180"
              )} />
            </button>
          )}

          {isWorkspaceDropdownOpen && (
            <>
              <div className={cn(
                "absolute top-full mt-1 bg-card border border-border rounded-md shadow-lg z-50",
                isCollapsed ? "left-full ml-2 -top-2 w-56" : "left-0 right-0"
              )}>
                <div className="py-1">
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                    Workspaces
                  </div>
                  {namespaces.map((namespace) => (
                    <button
                      key={namespace.id}
                      onClick={() => handleWorkspaceSelect(namespace)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center space-x-2",
                        currentNamespace?.id === namespace.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground"
                      )}
                    >
                      <Building2 className="h-4 w-4" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{namespace.organization.displayName}</div>
                      </div>
                    </button>
                  ))}
                  <div className="border-t border-border mt-1">
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <button
                          onClick={() => setIsWorkspaceDropdownOpen(true)}
                          className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted flex items-center space-x-2"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Create Organization</span>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Create Organization</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateNamespace} className="space-y-4">
                          <div className="space-y-2">
                            <label htmlFor="displayName" className="text-sm font-medium">Organization Name</label>
                            <Input
                              id="displayName"
                              value={formData.displayName}
                              onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                              placeholder="My Organization"
                              required
                            />
                          </div>
                          {createError && (
                            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                              {createError}
                            </div>
                          )}
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                              {isLoading ? "Creating..." : "Create Organization"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
              <div className="fixed inset-0 z-40" onClick={() => setIsWorkspaceDropdownOpen(false)} />
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1", isCollapsed ? "p-2" : "p-4")}>
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return isCollapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.to}
                    className="flex items-center justify-center p-2 text-sm font-medium rounded-md text-foreground hover:bg-muted hover:text-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.name}</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-muted hover:text-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Collapse Toggle */}
      <div className={cn("border-t border-border", isCollapsed ? "p-2" : "p-4")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleCollapsed}
              className={cn(
                "flex items-center text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                isCollapsed ? "justify-center p-2 w-full" : "space-x-3 px-3 py-2 w-full"
              )}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <>
                  <PanelLeftClose className="h-5 w-5" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
