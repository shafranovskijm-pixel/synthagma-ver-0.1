import { RotateCcw, Eye, GripVertical, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMenuCustomization, MenuItem } from "@/hooks/useMenuCustomization";
import { toast } from "sonner";

interface MenuResetSettingsProps {
  menuType: "student" | "admin" | "organization";
  defaultItems: MenuItem[];
  title?: string;
  description?: string;
}

export function MenuResetSettings({
  menuType,
  defaultItems,
  title = "Настройка меню",
  description = "Восстановите скрытые пункты меню"
}: MenuResetSettingsProps) {
  const { items, hiddenItems, showItem, showAllItems, resetToDefault } = useMenuCustomization(menuType, defaultItems);

  const handleShowAll = () => {
    showAllItems();
    toast.success("Все пункты меню восстановлены");
  };

  const handleReset = () => {
    resetToDefault();
    toast.success("Меню сброшено к настройкам по умолчанию");
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-sm lg:text-base">{title}</p>
        <p className="text-xs lg:text-sm text-muted-foreground">{description}</p>
      </div>

      {hiddenItems.length > 0 ? (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Скрытые пункты ({hiddenItems.length}):
          </div>
          <div className="space-y-2">
            {hiddenItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
              >
                <span className="text-sm">{item.label}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    showItem(item.id);
                    toast.success(`"${item.label}" восстановлен`);
                  }}
                  className="gap-1"
                >
                  <Eye className="w-4 h-4" />
                  Показать
                </Button>
              </div>
            ))}
          </div>
          <Button
            onClick={handleShowAll}
            variant="outline"
            className="w-full gap-2"
          >
            <Eye className="w-4 h-4" />
            Показать все пункты
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-secondary/30 rounded-lg text-center text-sm text-muted-foreground">
          Все пункты меню видимы
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <Button
          onClick={handleReset}
          variant="outline"
          className="w-full gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Сбросить порядок и видимость
        </Button>
      </div>
    </div>
  );
}
