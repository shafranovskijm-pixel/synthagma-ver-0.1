import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRightLeft, Building2, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { duplicateCourse } from "@/api/courses";
import { toast } from "sonner";

interface OrgItem {
  id: string;
  name: string;
  email?: string | null;
}

interface TransferCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string | null;
  courseTitle: string | null;
  currentOrganizationId: string | null;
  onTransferred?: () => void;
}

export function TransferCourseDialog({
  open, onOpenChange, courseId, courseTitle, currentOrganizationId, onTransferred,
}: TransferCourseDialogProps) {
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedOrgId(null);
    setSearch("");
    setPublishImmediately(false);
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, email")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error("Не удалось загрузить список организаций");
        setOrgs([]);
      } else {
        setOrgs((data || []) as OrgItem[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgs
      .filter(o => o.id !== currentOrganizationId)
      .filter(o => !q || o.name.toLowerCase().includes(q) || (o.email || "").toLowerCase().includes(q));
  }, [orgs, search, currentOrganizationId]);

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) || null;

  const handleTransfer = async () => {
    if (!courseId || !selectedOrgId) return;
    setTransferring(true);
    try {
      const newCourse = await duplicateCourse(courseId, selectedOrgId);
      if (!newCourse) {
        toast.error("Не удалось перенести курс. Проверьте права администратора.");
        return;
      }
      if (publishImmediately) {
        await supabase.from("courses").update({ is_published: true }).eq("id", newCourse.id);
      }
      toast.success(`Курс «${courseTitle}» скопирован в организацию «${selectedOrg?.name}»`);
      onTransferred?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error("Transfer course error:", e);
      toast.error(e?.message || "Ошибка при переносе курса");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Перенести курс в другую организацию
          </DialogTitle>
          <DialogDescription>
            Создаётся полная копия курса (уроки, тесты, банк вопросов) в выбранной организации. Оригинал остаётся в текущей.
          </DialogDescription>
        </DialogHeader>

        {courseTitle && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground mb-1">Курс</div>
            <div className="font-medium truncate">{courseTitle}</div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="org-search">Целевая организация</Label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="org-search"
              placeholder="Поиск по названию или email"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <ScrollArea className="h-64 rounded-lg border border-border">
            {loading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2 py-10">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-10">
                Нет организаций
              </div>
            ) : (
              <div className="p-1">
                {filtered.map(org => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => setSelectedOrgId(org.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                      selectedOrgId === org.id
                        ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{org.name}</div>
                      {org.email && <div className="text-xs text-muted-foreground truncate">{org.email}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox
            checked={publishImmediately}
            onCheckedChange={v => setPublishImmediately(!!v)}
          />
          Опубликовать копию сразу (по умолчанию — черновик)
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={transferring}>
            Отмена
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedOrgId || transferring}
            className="gap-2"
          >
            {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Перенести копию
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
