import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw, Plus, Trash2 } from "lucide-react";
import { openingMonolog, coldCallScript } from "@/constants/coldCallScript";

interface ScriptSection {
  title: string;
  body: string;
}
interface ScriptOverrides {
  opening?: string;
  sections?: ScriptSection[];
}

interface Props {
  managerId: string;
}

// Разворачиваем общий скрипт в набор секций-заготовок для менеджера.
function defaultSectionsFromCommon(): ScriptSection[] {
  return coldCallScript.map(tab => ({
    title: tab.title,
    body: tab.items
      .map(i => (i.title ? `• ${i.title}\n${i.text}` : `• ${i.text}`) + (i.followUps ? "\n" + i.followUps.map(f => `  → ${f.title ? f.title + ": " : ""}${f.text}`).join("\n") : ""))
      .join("\n\n"),
  }));
}

export function ManagerScriptEditor({ managerId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string>(openingMonolog);
  const [sections, setSections] = useState<ScriptSection[]>(defaultSectionsFromCommon());

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("sales_managers").select("script_overrides").eq("id", managerId).maybeSingle();
    const ov: ScriptOverrides | null = data?.script_overrides ?? null;
    setOpening(ov?.opening ?? openingMonolog);
    setSections(ov?.sections?.length ? ov.sections : defaultSectionsFromCommon());
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerId]);

  const save = async () => {
    setSaving(true);
    const payload: ScriptOverrides = {
      opening: opening.trim() && opening !== openingMonolog ? opening : undefined,
      sections,
    };
    const { error } = await (supabase as any).from("sales_managers").update({ script_overrides: payload }).eq("id", managerId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Скрипт сохранён");
  };

  const resetToDefault = () => {
    if (!confirm("Сбросить скрипт к общему?")) return;
    setOpening(openingMonolog);
    setSections(defaultSectionsFromCommon());
  };

  const updateSection = (i: number, patch: Partial<ScriptSection>) =>
    setSections(s => s.map((sec, idx) => idx === i ? { ...sec, ...patch } : sec));

  const removeSection = (i: number) => setSections(s => s.filter((_, idx) => idx !== i));
  const addSection = () => setSections(s => [...s, { title: "Новый раздел", body: "" }]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Персональный скрипт менеджера. Вступительный монолог отображается в караоке во время звонка. Разделы («Вопросы», «Возражения», «Закрытие») видны менеджеру во вкладке «Скрипт» в карточке компании.
      </div>

      <div>
        <Label className="text-sm">Вступительный монолог (30–40 сек)</Label>
        <Textarea rows={6} value={opening} onChange={e => setOpening(e.target.value)} className="mt-1 text-sm" />
        <div className="text-[11px] text-muted-foreground mt-1">Плейсхолдеры: {"{manager_name}, {company_name}, {contact_name}, {phone}"}</div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Разделы скрипта</div>
          <Button size="sm" variant="outline" onClick={addSection}><Plus className="w-3.5 h-3.5 mr-1" />Добавить</Button>
        </div>
        {sections.map((sec, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input value={sec.title} onChange={e => updateSection(i, { title: e.target.value })} className="text-sm font-medium" />
              <Button size="sm" variant="ghost" onClick={() => removeSection(i)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
            <Textarea rows={7} value={sec.body} onChange={e => updateSection(i, { body: e.target.value })} className="text-sm font-mono" />
          </div>
        ))}
      </div>

      <div className="flex gap-2 sticky bottom-0 bg-background pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Сохранить
        </Button>
        <Button variant="outline" onClick={resetToDefault}><RotateCcw className="w-4 h-4 mr-1" />Сбросить к общему</Button>
      </div>
    </div>
  );
}
