import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BookOpen, Save, Eye } from "lucide-react";
import DOMPurify from "dompurify";

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  courseId: string;
  courseTitle?: string | null;
  onSaved?: (plan: { title: string; hours: number | null; form: string; plan_html: string }) => void;
}

export function TrainingPlanEditor({ open, onClose, organizationId, courseId, courseTitle, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState<string>("");
  const [form, setForm] = useState("");
  const [planHtml, setPlanHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !courseId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("program_training_plans")
        .select("title, hours, form, plan_html")
        .eq("course_id", courseId)
        .maybeSingle();
      if (data) {
        setTitle(data.title || courseTitle || "");
        setHours(data.hours != null ? String(data.hours) : "");
        setForm(data.form || "");
        setPlanHtml(data.plan_html || "");
      } else {
        setTitle(courseTitle || "");
        setHours(""); setForm(""); setPlanHtml("");
      }
      setLoading(false);
    })();
  }, [open, courseId, courseTitle]);

  const save = async () => {
    if (!organizationId || !courseId) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        course_id: courseId,
        title: title || null,
        hours: hours ? Number(hours) : null,
        form: form || null,
        plan_html: planHtml || "",
      };
      const { error } = await (supabase as any)
        .from("program_training_plans")
        .upsert(payload, { onConflict: "course_id" });
      if (error) throw error;
      toast.success("Учебный план сохранён");
      onSaved?.({ title: title || "", hours: hours ? Number(hours) : null, form, plan_html: planHtml });
      onClose();
    } catch (e: any) {
      toast.error("Не удалось сохранить", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const preview = DOMPurify.sanitize(planHtml || "<p style='color:#888'>Учебный план пока не заполнен.</p>", { USE_PROFILES: { html: true } });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Учебный план программы</DialogTitle>
          <DialogDescription>План хранится в организации и подставляется в договор как переменная <code>{`{{training_plan}}`}</code>.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : (
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Название программы</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Охрана труда" />
              </div>
              <div className="space-y-1.5">
                <Label>Часов</Label>
                <Input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="40" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Форма обучения</Label>
              <Input value={form} onChange={e => setForm(e.target.value)} placeholder="Заочная (с применением дистанционных технологий)" />
            </div>

            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">HTML</TabsTrigger>
                <TabsTrigger value="preview"><Eye className="w-3 h-3 mr-1" />Предпросмотр</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <Textarea
                  value={planHtml}
                  onChange={e => setPlanHtml(e.target.value)}
                  rows={14}
                  className="font-mono text-xs"
                  placeholder="<h3>Учебно-тематический план</h3><table>...</table>"
                />
              </TabsContent>
              <TabsContent value="preview">
                <div className="border rounded-lg p-4 bg-white min-h-[300px] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: preview }} />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving || loading} className="gap-1.5"><Save className="w-4 h-4" />Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
