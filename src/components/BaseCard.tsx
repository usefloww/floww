import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";

interface BaseCardProps {
  to: string;
  params?: Record<string, string>;
  children: ReactNode;
}

export function BaseCard({ to, params, children }: BaseCardProps) {
  return (
    <Link
      to={to as any}
      params={params as any}
      className="block p-6 bg-card border border-border rounded-lg hover:shadow-lg hover:border-primary transition-all duration-200 group"
    >
      <div className="space-y-2">
        {children}
      </div>
    </Link>
  );
}