import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  trend = "up",
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon?: LucideIcon;
  className?: string;
}) {
  const color = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <Card className={cn("gap-1", className)}>
      <CardContent>
        <div className="label-mono flex items-center justify-between">
          {label}
          {Icon && <Icon className="size-4" aria-hidden />}
        </div>
        <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">{value}</div>
        {delta && <div className={cn("text-xs font-medium", color)}>{delta}</div>}
      </CardContent>
    </Card>
  );
}
