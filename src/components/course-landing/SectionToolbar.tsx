import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  sectionId: string;
  isHidden: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  onDelete?: () => void;
  label: string;
}

export function SectionToolbar({
  sectionId,
  isHidden,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDelete,
  label,
}: Props) {
  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover/section:opacity-100 transition-opacity">
      <div className="flex items-center gap-1 bg-background border border-border rounded-lg shadow-lg px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground px-2">{label}</span>
        <div className="w-px h-4 bg-border" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={!canMoveUp}>
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={!canMoveDown}>
          <ArrowDown className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleVisibility}>
          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </Button>
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
