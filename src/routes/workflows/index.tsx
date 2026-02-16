import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNamespaceStore } from "@/stores/namespaceStore";
import { handleApiError } from "@/lib/api";
import { getConfig } from "@/lib/server/config";
import { Workflow, Folder } from "@/types/api";
import {
  getWorkflows,
  createWorkflow as createWorkflowFn,
  updateWorkflow as updateWorkflowFn,
  importN8nWorkflow,
  getFolders,
  getFolderPath,
  createFolder as createFolderFn,
  updateFolder as updateFolderFn,
  deleteFolder as deleteFolderFn,
} from "@/lib/server/workflows";
import { Loader } from "@/components/Loader";
import { FolderBreadcrumb } from "@/components/FolderBreadcrumb";
import { 
  Search, 
  Workflow as WorkflowIcon, 
  MoreVertical, 
  Trash2, 
  Building2, 
  Info, 
  Upload, 
  Loader2, 
  Plus, 
  Sparkles, 
  FolderIcon,
  FolderPlus,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { DeleteWorkflowDialog } from "@/components/DeleteWorkflowDialog";
import { showSuccessNotification, showErrorNotification } from "@/stores/notificationStore";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Provider logo mapping to Simple Icons CDN
const getProviderLogoUrl = (type: string): string | null => {
  const iconMap: Record<string, string> = {
    "openai": "openai",
    'aws': 'amazonaws',
    'gcp': 'googlecloud',
    'googlecloud': 'googlecloud',
    'azure': 'microsoftazure',
    'microsoftazure': 'microsoftazure',
    'github': 'github',
    'gitlab': 'gitlab',
    'docker': 'docker',
    'kubernetes': 'kubernetes',
    'terraform': 'terraform',
    'slack': 'slack',
    'discord': 'discord',
    'jenkins': 'jenkins',
    'circleci': 'circleci',
    'githubactions': 'githubactions',
  };

  const iconName = iconMap[type.toLowerCase()];
  if (!iconName) return null;
  
  return `https://cdn.simpleicons.org/${iconName}`;
};

interface WorkflowsSearchParams {
  folder?: string;
}

export const Route = createFileRoute("/workflows/")({
  component: WorkflowsPage,
  validateSearch: (search: Record<string, unknown>): WorkflowsSearchParams => {
    return {
      folder: typeof search.folder === 'string' ? search.folder : undefined,
    };
  },
});

function WorkflowsPage() {
  const { currentNamespace } = useNamespaceStore();
  const search = useSearch({ from: "/workflows/" });
  const currentFolderId = search.folder || null;
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename">("create");
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Navigate to a folder
  const navigateToFolder = (folderId: string | null) => {
    navigate({
      to: "/workflows/",
      search: folderId ? { folder: folderId } : {},
    } as any);
  };

  // Fetch folder path for breadcrumb
  const { data: folderPath } = useQuery({
    queryKey: ['folder-path', currentFolderId],
    queryFn: async () => {
      if (!currentFolderId) return [];
      const data = await getFolderPath({ data: { folderId: currentFolderId } });
      return data.results;
    },
    enabled: !!currentFolderId,
  });

  // Fetch folders in current location
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ['folders', currentNamespace?.id, currentFolderId],
    queryFn: async () => {
      const data = await getFolders({
        data: {
          namespaceId: currentNamespace?.id,
          parentFolderId: currentFolderId,
        },
      });
      return data.results || [];
    },
    enabled: !!currentNamespace?.id,
  });

  // Fetch workflows in current location
  const { data: workflowsData, isLoading: workflowsLoading, error } = useQuery({
    queryKey: ['workflows', currentNamespace?.id, currentFolderId],
    queryFn: async () => {
      const data = await getWorkflows({
        data: {
          namespaceId: currentNamespace?.id,
          parentFolderId: currentFolderId,
          rootOnly: !currentFolderId,
        },
      });
      return Array.isArray(data?.results) ? data.results : [];
    },
    enabled: !!currentNamespace?.id,
  });

  // Fetch config to check if AI Builder is enabled
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => getConfig(),
  });

  const isAiBuilderEnabled = config?.features.aiBuilder ?? false;

  const folders = foldersData || [];
  const workflows = workflowsData || [];
  const isLoading = foldersLoading || workflowsLoading;
  const errorMessage = error ? handleApiError(error) : null;

  // Filter by search term
  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredWorkflows = workflows.filter(workflow =>
    workflow?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (workflow?.description && workflow.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (n8nJson: object) => {
      if (!currentNamespace?.id) {
        throw new Error("No namespace selected");
      }
      return importN8nWorkflow({
        data: {
          namespaceId: currentNamespace.id,
          n8nJson: n8nJson,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccessNotification("Workflow imported", "The workflow was imported successfully.");
    },
    onError: (error) => {
      showErrorNotification("Import failed", handleApiError(error));
    },
  });

  // Create workflow mutation
  const createWorkflowMutation = useMutation({
    mutationFn: async () => {
      if (!currentNamespace?.id) {
        throw new Error("No namespace selected");
      }
      return createWorkflowFn({
        data: {
          name: "New Workflow",
          namespaceId: currentNamespace.id,
          description: isAiBuilderEnabled ? "Created with AI Builder" : undefined,
          parentFolderId: currentFolderId || undefined,
        },
      });
    },
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      navigate({
        to: "/workflows/$workflowId/deployments",
        params: { workflowId: workflow.id },
        search: { tab: isAiBuilderEnabled ? "builder" : "edit" },
      } as any);
    },
    onError: (error) => {
      showErrorNotification("Failed to create workflow", handleApiError(error));
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!currentNamespace?.id) {
        throw new Error("No namespace selected");
      }
      return createFolderFn({
        data: {
          namespaceId: currentNamespace.id,
          name,
          parentFolderId: currentFolderId || undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setFolderDialogOpen(false);
      setFolderName("");
      showSuccessNotification("Folder created", "The folder has been created successfully.");
    },
    onError: (error) => {
      showErrorNotification("Failed to create folder", handleApiError(error));
    },
  });

  // Rename folder mutation
  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return updateFolderFn({ data: { folderId: id, name } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder-path'] });
      setFolderDialogOpen(false);
      setFolderName("");
      setSelectedFolder(null);
      showSuccessNotification("Folder renamed", "The folder has been renamed successfully.");
    },
    onError: (error) => {
      showErrorNotification("Failed to rename folder", handleApiError(error));
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteFolderFn({ data: { folderId: id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setDeleteFolderDialogOpen(false);
      setSelectedFolder(null);
      showSuccessNotification("Folder deleted", "The folder and its contents have been deleted.");
    },
    onError: (error) => {
      showErrorNotification("Failed to delete folder", handleApiError(error));
    },
  });

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleUseBuilder = () => {
    createWorkflowMutation.mutate();
  };

  const handleCreateFolder = () => {
    setFolderDialogMode("create");
    setFolderName("");
    setSelectedFolder(null);
    setFolderDialogOpen(true);
  };

  const handleRenameFolder = (folder: Folder) => {
    setFolderDialogMode("rename");
    setFolderName(folder.name);
    setSelectedFolder(folder);
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = (folder: Folder) => {
    setSelectedFolder(folder);
    setDeleteFolderDialogOpen(true);
  };

  const handleFolderDialogSubmit = () => {
    if (!folderName.trim()) return;
    
    if (folderDialogMode === "create") {
      createFolderMutation.mutate(folderName.trim());
    } else if (selectedFolder) {
      renameFolderMutation.mutate({ id: selectedFolder.id, name: folderName.trim() });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      importMutation.mutate(json);
    } catch {
      showErrorNotification("Invalid file", "The selected file is not valid JSON");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDelete = (workflow: Workflow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedWorkflow(workflow);
    setDeleteDialogOpen(true);
  };

  const handleDeleteDialogClose = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setSelectedWorkflow(null);
    }
  };

  const hasContent = filteredFolders.length > 0 || filteredWorkflows.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workflows</h1>
        </div>
      </div>

      {/* Breadcrumb */}
      {(currentFolderId || (folderPath && folderPath.length > 0)) && (
        <FolderBreadcrumb
          path={folderPath as any || []}
          onNavigate={navigateToFolder}
        />
      )}

      {/* Search and Actions */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <input
            type="text"
            placeholder="Search workflows and folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={importMutation.isPending || createWorkflowMutation.isPending || createFolderMutation.isPending || !currentNamespace}
              className="gap-2"
            >
              {(importMutation.isPending || createWorkflowMutation.isPending || createFolderMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  New
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isAiBuilderEnabled && (
              <DropdownMenuItem onClick={handleUseBuilder}>
                <Sparkles className="h-4 w-4 mr-2" />
                Use builder
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleImportClick}>
              <Upload className="h-4 w-4 mr-2" />
              Import from n8n
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCreateFolder}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {errorMessage}
        </div>
      )}

      {/* Content */}
      <Loader isLoading={isLoading} loadingMessage="Loading...">
        {!hasContent ? (
          <div className="text-center py-12">
            <WorkflowIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-medium text-foreground">
              {searchTerm ? "No results" : "Empty folder"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {searchTerm 
                ? "No workflows or folders match your search." 
                : currentFolderId 
                  ? "This folder is empty."
                  : "No workflows found in this namespace."}
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[40%]">Name</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Last Deployed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Folders first */}
                {filteredFolders.map((folder) => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    onNavigate={navigateToFolder}
                    onRename={handleRenameFolder}
                    onDelete={handleDeleteFolder}
                  />
                ))}
                {/* Then workflows */}
                {filteredWorkflows.map((workflow) => (
                  <WorkflowRow
                    key={workflow.id}
                    workflow={workflow as any}
                    onDelete={handleDelete}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Loader>

      {/* Delete Workflow Dialog */}
      {currentNamespace && (
        <DeleteWorkflowDialog
          open={deleteDialogOpen}
          onOpenChange={handleDeleteDialogClose}
          workflow={selectedWorkflow}
          namespaceId={currentNamespace.id}
        />
      )}

      {/* Create/Rename Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folderDialogMode === "create" ? "Create folder" : "Rename folder"}
            </DialogTitle>
            <DialogDescription>
              {folderDialogMode === "create" 
                ? "Enter a name for the new folder."
                : "Enter a new name for this folder."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleFolderDialogSubmit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleFolderDialogSubmit}
              disabled={!folderName.trim() || createFolderMutation.isPending || renameFolderMutation.isPending}
            >
              {(createFolderMutation.isPending || renameFolderMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {folderDialogMode === "create" ? "Create" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <Dialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedFolder?.name}"? This will also delete all workflows and subfolders inside it. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => selectedFolder && deleteFolderMutation.mutate(selectedFolder.id)}
              disabled={deleteFolderMutation.isPending}
            >
              {deleteFolderMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FolderRowProps {
  folder: Folder;
  onNavigate: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

function FolderRow({ folder, onNavigate, onRename, onDelete }: FolderRowProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <TableRow 
      className="group cursor-pointer hover:bg-muted/50"
      onClick={() => onNavigate(folder.id)}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <FolderIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{folder.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-center text-muted-foreground">—</TableCell>
      <TableCell>
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(false);
                onRename(folder);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(false);
                onDelete(folder);
              }}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

interface WorkflowRowProps {
  workflow: Workflow;
  onDelete: (workflow: Workflow, e: React.MouseEvent) => void;
}

function WorkflowRow({ workflow, onDelete }: WorkflowRowProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Extract unique provider types from lastDeployment, filtering out "builtin"
  const providerTypes = workflow.lastDeployment?.providerDefinitions
    ? Array.from(
        new Set(
          workflow.lastDeployment.providerDefinitions
            .map((p: { type: string }) => p.type)
            .filter((type: string) => type.toLowerCase() !== "builtin")
        )
      )
    : [];

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 1) return "just now";
    if (diffMinutes === 1) return "1m ago";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours === 1) return "1h ago";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "1d ago";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 14) return "1w ago";
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 60) return "1mo ago";
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const lastDeployedRelative = workflow.lastDeployment?.deployedAt
    ? formatRelativeTime(new Date(workflow.lastDeployment.deployedAt))
    : "—";
  const createdDate = formatDate(workflow.createdAt);

  const toggleMutation = useMutation({
    mutationFn: async (active: boolean) => {
      return await updateWorkflowFn({ data: { workflowId: workflow.id, active } });
    },
    onSuccess: (_, active) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccessNotification(
        `Workflow ${active ? 'activated' : 'deactivated'}`,
        `The workflow has been ${active ? 'activated' : 'deactivated'} successfully.`
      );
    },
    onError: (error) => {
      const errorMessage = handleApiError(error);
      showErrorNotification("Failed to update workflow status", errorMessage);
    },
  });

  const handleToggle = (checked: boolean) => {
    toggleMutation.mutate(checked);
  };

  return (
    <TableRow className="group">
      {/* Name */}
      <TableCell>
        <Link
          {...({ to: "/workflows/$workflowId/deployments", params: { workflowId: workflow.id } } as any)}
          className="flex items-center gap-2 hover:text-primary transition-colors"
        >
          <span className="font-medium text-foreground truncate">{workflow.name}</span>
          {workflow.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </TooltipTrigger>
              <TooltipContent 
                className="bg-popover text-popover-foreground border border-border"
                arrowClassName="bg-popover fill-popover"
              >
                <p className="max-w-xs">{workflow.description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </Link>
      </TableCell>

      {/* Providers */}
      <TableCell>
        {providerTypes.length > 0 ? (
          <div className="flex items-center gap-1.5">
            {providerTypes.map((providerType) => {
              const logoUrl = getProviderLogoUrl(providerType);
              return (
                <Tooltip key={providerType}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center h-5 w-5 rounded">
                      {logoUrl && !imageErrors.has(providerType) ? (
                        <img
                          src={logoUrl}
                          alt={providerType}
                          className="h-4 w-4 object-contain opacity-70"
                          onError={() => {
                            setImageErrors((prev) => new Set(prev).add(providerType));
                          }}
                        />
                      ) : (
                        <Building2 className="h-4 w-4 text-muted-foreground opacity-60" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="capitalize">{providerType}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Last Deployed */}
      <TableCell className="text-muted-foreground text-sm">
        {lastDeployedRelative}
      </TableCell>

      {/* Created */}
      <TableCell className="text-muted-foreground text-sm">
        {createdDate}
      </TableCell>

      {/* Active Toggle */}
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        {!workflow.lastDeployment ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex">
                <Switch
                  checked={false}
                  onCheckedChange={handleToggle}
                  disabled={true}
                  aria-label="Workflow status unavailable (no deployment)"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent 
              className="bg-popover text-popover-foreground border border-border"
              arrowClassName="bg-popover fill-popover"
            >
              <p>Cannot activate: no deployment</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Switch
            checked={workflow.active ?? false}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
            aria-label={`Toggle workflow ${workflow.active ? 'inactive' : 'active'}`}
          />
        )}
      </TableCell>

      {/* Actions */}
      <TableCell>
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                setDropdownOpen(false);
                onDelete(workflow, e);
              }}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
