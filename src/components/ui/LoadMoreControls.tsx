import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface LoadMoreControlsProps {
  visibleCount: number;
  totalCount: number;
  onLoadMore: (count: number) => void;
}

const LOAD_OPTIONS = [10, 25, 50, 100];

export function LoadMoreControls({ visibleCount, totalCount, onLoadMore }: LoadMoreControlsProps) {
  if (visibleCount >= totalCount) return null;
  const remaining = totalCount - visibleCount;

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-sm text-muted-foreground">
        Показано {visibleCount} из {totalCount}
      </p>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {LOAD_OPTIONS.filter(n => n <= remaining).map(n => (
          <Button key={n} variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => onLoadMore(n)}>
            <ChevronDown className="w-3.5 h-3.5" />
            Ещё {n}
          </Button>
        ))}
        {remaining > 0 && (
          <Button variant="ghost" size="sm" className="rounded-xl text-xs text-muted-foreground" onClick={() => onLoadMore(remaining)}>
            Все ({remaining})
          </Button>
        )}
      </div>
    </div>
  );
}
