import { Link } from "@tanstack/react-router";
import { Button } from "@web/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  actions?: React.ReactNode;
  backTo?: string;
  children?: React.ReactNode;
  title: string;
}

export function PageHeader({
  title,
  backTo,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {backTo && (
          <Button asChild size="icon" variant="ghost">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
        )}
        <h1 className="font-bold text-2xl tracking-tight">{title}</h1>
        {children}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
