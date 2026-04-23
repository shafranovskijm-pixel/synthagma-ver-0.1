/**
 * Унифицированное пустое состояние для таблиц, списков и пустых разделов.
 *
 * Использование:
 *   <EmptyState
 *     icon={Users}
 *     title="Пока нет студентов"
 *     description="Добавьте первого студента, чтобы начать обучение."
 *     action={{ label: "Добавить", onClick: () => setOpen(true) }}
 *   />
 */
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary" | "ghost";
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6 rounded-2xl border border-dashed border-border bg-card/40",
        className,
      )}
    >
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
          {description}
        </p>
      )}
      {action && (
        <Button
          onClick={action.onClick}
          variant={action.variant ?? "default"}
          size="sm"
          className="mt-5 rounded-xl"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
