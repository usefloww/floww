import { ChevronRight, Home } from "lucide-react";
import { Folder } from "@/types/api";

interface FolderBreadcrumbProps {
  path: Folder[];
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ path, onNavigate }: FolderBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50 flex-shrink-0"
      >
        <Home className="h-4 w-4" />
        <span>Root</span>
      </button>
      
      {path.map((folder, index) => (
        <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          {index === path.length - 1 ? (
            <span className="px-2 py-1 font-medium text-foreground">
              {folder.name}
            </span>
          ) : (
            <button
              onClick={() => onNavigate(folder.id)}
              className="hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50"
            >
              {folder.name}
            </button>
          )}
        </div>
      ))}
    </nav>
  );
}

