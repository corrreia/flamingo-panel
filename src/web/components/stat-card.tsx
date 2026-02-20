import { Card, CardContent } from "@web/components/ui/card";

export function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="text-primary">{icon}</div>
        <div>
          <div className="text-muted-foreground text-xs">{label}</div>
          <div className="font-medium text-sm">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
