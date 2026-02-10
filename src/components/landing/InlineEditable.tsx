import { useState, useRef, useEffect, forwardRef, type ReactNode } from "react";
import { useLandingContent } from "./LandingContentContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

interface InlineEditableProps {
  contentKey: string;
  defaultValue: string;
  children: (value: string) => ReactNode;
  as?: "span" | "div";
}

export const InlineEditable = forwardRef<HTMLElement, InlineEditableProps>(
  function InlineEditable({ contentKey, defaultValue, children, as: Tag = "span" }, _ref) {
  const { getValue, updateValue, isAdmin, isLoggedIn, showLogin } = useLandingContent();
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);

  const value = getValue(contentKey, defaultValue);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      showLogin();
      return;
    }

    if (!isAdmin) {
      toast({ title: "Нет прав для редактирования", variant: "destructive" });
      return;
    }

    setEditValue(value);
    setOpen(true);
  };

  // Always attach context menu handler so login popup can appear
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateValue(contentKey, editValue);
      toast({ title: "Сохранено" });
      setOpen(false);
    } catch {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tag
          ref={triggerRef as any}
          onContextMenu={handleContextMenu}
          className={ctrlHeld ? "outline-dashed outline-1 outline-accent/50 cursor-pointer rounded" : ""}
          style={{ display: Tag === "span" ? "inline" : undefined }}
        >
          {children(value)}
        </Tag>
      </PopoverTrigger>
      <PopoverContent className="w-80 z-[100]" side="bottom" align="start">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium">
            Редактирование: <code className="text-accent">{contentKey}</code>
          </p>
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={4}
            className="text-sm"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
