/**
 * Скелет-загрузка для таблиц вместо спиннера.
 * Создаёт rows × cols ячеек с pulse-анимацией.
 *
 * Использование:
 *   {loading ? <TableSkeleton rows={6} cols={4} /> : <Table>...</Table>}
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
  /** Показать строку-«шапку» сверху */
  withHeader?: boolean;
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
  className,
  withHeader = true,
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full space-y-3", className)}>
      {withHeader && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-4 w-3/4" />
          ))}
        </div>
      )}
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="grid gap-3 py-2"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={`c-${r}-${c}`}
                className={cn("h-5", c === 0 ? "w-full" : "w-4/5")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
