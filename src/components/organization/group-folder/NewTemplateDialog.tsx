import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { extractVariables } from "@/lib/templateRenderer";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

interface Props {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (templateId: string) => void;
}

const STARTER = `<h1 style="text-align:center">ДОГОВОР № {{contract_number}}</h1>
<p style="text-align:center">от {{contract_date}}</p>

<p><b>{{org_name}}</b>, ИНН {{org_inn}}, в лице {{org_director_position}} {{org_director_name}}, {{org_director_acting}} на основании Устава, именуемое в дальнейшем «Исполнитель», с одной стороны, и</p>
<p><b>{{individual_name}}</b>, паспорт {{individual_passport}}, адрес: {{individual_address}}, именуемый в дальнейшем «Заказчик», с другой стороны, заключили настоящий договор о нижеследующем:</p>

<h3>1. Предмет договора</h3>
<p>1.1. Исполнитель обязуется оказать Заказчику услуги по обучению по программе «{{course_title}}» {{course_duration}}.</p>

<h3>2. Стоимость и порядок оплаты</h3>
<p>2.1. Стоимость услуг составляет {{total_price}} руб. ({{total_price_words}}).</p>
`;

export function NewTemplateDialog({ organizationId, open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [body, setBody] = useState(STARTER);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setBody(STARTER); }
  }, [open]);

  const detected = useMemo(() => extractVariables(body), [body]);

  const save = async () => {
    if (!name.trim()) { toast.error("Укажите название шаблона"); return; }
    if (!body.trim()) { toast.error("Тело шаблона не может быть пустым"); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("org_contract_templates")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          body_html: body,
          variables: { detected },
          is_default: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Шаблон сохранён");
      onCreated?.(data.id);
      onClose();
    } catch (e: any) {
      toast.error("Не удалось сохранить шаблон", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый шаблон договора</DialogTitle>
          <DialogDescription>
            Вставьте HTML-текст договора. Переменные пишите в двойных фигурных скобках:
            <code className="mx-1 px-1 py-0.5 rounded bg-muted">{`{{contract_number}}`}</code>,
            <code className="mx-1 px-1 py-0.5 rounded bg-muted">{`{{individual_name}}`}</code> и т.д.
            Система сама найдёт их при генерации и предложит заполнить.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Название шаблона</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Договор с физ.лицом" />
          </div>
          <div className="space-y-1.5">
            <Label>HTML тела договора</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={16} className="font-mono text-xs" />
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Найдено переменных: {detected.length}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {detected.length === 0
                ? <span className="text-xs text-muted-foreground">Переменные не найдены — используйте синтаксис {`{{key}}`}</span>
                : detected.map(v => (
                    <Badge key={v} variant="secondary" className="rounded-full text-xs font-mono">{`{{${v}}}`}</Badge>
                  ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Сохранение…" : "Сохранить шаблон"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
