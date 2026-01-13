import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Settings2, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/hooks/useMenuCustomization";

interface SortableMenuItemProps {
  item: MenuItem;
  isEditMode: boolean;
  isActive: boolean;
  onHide: () => void;
  onClick: () => void;
  renderIcon: (iconName: string) => React.ReactNode;
}

function SortableMenuItem({ 
  item, 
  isEditMode, 
  isActive, 
  onHide, 
  onClick, 
  renderIcon 
}: SortableMenuItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group",
        isDragging && "z-50 opacity-80"
      )}
    >
      <div className="flex items-center gap-1">
        {isEditMode && (
          <div
            {...attributes}
            {...listeners}
            className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <button
          onClick={onClick}
          disabled={isEditMode}
          className={cn(
            "flex-1 flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-secondary",
            isEditMode && "cursor-default"
          )}
        >
          {renderIcon(item.icon)}
          <span className="truncate">{item.label}</span>
        </button>
        {isEditMode && (
          <button
            onClick={onHide}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            title="Скрыть"
          >
            <EyeOff className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface DraggableMenuProps {
  items: MenuItem[];
  activeItemId: string;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onHideItem: (itemId: string) => void;
  onItemClick: (itemId: string) => void;
  renderIcon: (iconName: string) => React.ReactNode;
  className?: string;
}

export function DraggableMenu({
  items,
  activeItemId,
  isEditMode,
  setIsEditMode,
  onReorder,
  onHideItem,
  onItemClick,
  renderIcon,
  className,
}: DraggableMenuProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      onReorder(oldIndex, newIndex);
    }
  };

  const visibleItems = items.filter(item => item.visible);

  return (
    <div className={cn("space-y-2", className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visibleItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
          {visibleItems.map((item) => (
            <SortableMenuItem
              key={item.id}
              item={item}
              isEditMode={isEditMode}
              isActive={item.id === activeItemId}
              onHide={() => onHideItem(item.id)}
              onClick={() => onItemClick(item.id)}
              renderIcon={renderIcon}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface MenuSettingsButtonProps {
  isEditMode: boolean;
  onToggle: () => void;
}

export function MenuSettingsButton({ isEditMode, onToggle }: MenuSettingsButtonProps) {
  return (
    <Button
      variant={isEditMode ? "secondary" : "ghost"}
      size="sm"
      onClick={onToggle}
      className="w-full justify-start gap-2"
    >
      {isEditMode ? (
        <>
          <X className="w-4 h-4" />
          Готово
        </>
      ) : (
        <>
          <Settings2 className="w-4 h-4" />
          Настроить меню
        </>
      )}
    </Button>
  );
}

interface HiddenItemsRestoreProps {
  hiddenItems: MenuItem[];
  onShowItem: (itemId: string) => void;
  onShowAll: () => void;
  renderIcon: (iconName: string) => React.ReactNode;
}

export function HiddenItemsRestore({ 
  hiddenItems, 
  onShowItem, 
  onShowAll,
  renderIcon 
}: HiddenItemsRestoreProps) {
  if (hiddenItems.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between px-2">
        <span className="text-xs text-muted-foreground">Скрытые пункты</span>
        <button
          onClick={onShowAll}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          Показать все
        </button>
      </div>
      <div className="space-y-1">
        {hiddenItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onShowItem(item.id)}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-muted-foreground/60 hover:bg-secondary/50 hover:text-muted-foreground transition-colors"
          >
            {renderIcon(item.icon)}
            <span className="truncate">{item.label}</span>
            <Eye className="w-4 h-4 ml-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}
