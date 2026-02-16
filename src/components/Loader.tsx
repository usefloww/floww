import React from "react";

interface LoaderProps {
  isLoading: boolean;
  children: React.ReactNode;
  loadingMessage?: string;
}

export function Loader({ isLoading, children, loadingMessage = "Loading..." }: LoaderProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground text-sm">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

