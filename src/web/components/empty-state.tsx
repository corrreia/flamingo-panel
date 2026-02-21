import { Card, CardContent } from "@web/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  action?: React.ReactNode;
  className?: string;
  description?: string;
  icon: LucideIcon;
  title: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Icon className="mb-4 h-12 w-12 text-primary/30" />
        <p className="text-muted-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-muted-foreground text-sm">{description}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}
