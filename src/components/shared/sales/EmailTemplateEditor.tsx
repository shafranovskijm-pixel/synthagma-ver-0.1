import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, Save, Variable } from "lucide-react";
import type { EmailTemplate } from "@/hooks/useEmailTemplates";
import { TEMPLATE_CATEGORIES } from "@/hooks/useEmailTemplates";

const COMMON_VARS = [
  { v: "{{name}}", desc: "Имя получателя" },
  { v: "{{email}}", desc: "Email получателя" },
  { v: "{{company}}", desc: "Компания получателя" },
  { v: "{{proposal_url}}", desc: "Ссылка на КП" },
  { v: "{{signing_url}}", desc: "Ссылка на подписание договора" },
  { v: "{{document_title}}", desc: "Название документа" },
  { v: "{{sender_name}}", desc: "Имя отправителя" },
];

interface Props {
  template: Partial<EmailTemplate> | null;
  onClose: () => void;
  onSave: (t: Partial<EmailTemplate> & { name: string; subject: string; html_body: string; category: string }) => Promise<EmailTemplate | null>;
  onSendTest?: (id: string, email: string) => Promise<boolean>;
}

export function EmailTemplateEditor({ template, onClose, onSave, onSendTest }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(template?.name || "");
    setCategory(template?.category || "custom");
    setSubject(template?.subject || "");
    setBody(template?.html_body || "");
  }, [template]);

  const previewHtml = useMemo(() => {
    const sample: Record<string, string> = {
      "{{name}}": "Иван Иванов",
      "{{email}}": "ivan@example.com",
      "{{company}}": "ООО Ромашка",
      "{{proposal_url}}": "https://example.com/proposal/demo",
      "{{signing_url}}": "https://example.com/sign/demo",
      "{{document_title}}": "Договор оказания услуг №1",
      "{{sender_name}}": "Менеджер",
    };
    let h = body || "";
    for (const [k, v] of Object.entries(sample)) {
      h = h.split(k).join(v);
    }
    return DOMPurify.sanitize(h, { USE_PROFILES: { html: true } });
  }, [body]);

  const insertVar = (v: string) => {
    setBody(prev => prev + (prev.endsWith("\n") || prev === "" ? "" : " ") + v);
  };

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) return;
    setSaving(true);
    const sanitized = DOMPurify.sanitize(body, { USE_PROFILES: { html: true } });
    await onSave({
      ...(template?.id ? { id: template.id } : {}),
      name: name.trim(),
      category,
      subject: subject.trim(),
      html_body: sanitized,
      is_default: false,
    });
    setSaving(false);
    onClose();
  };

  const handleSendTest = async () => {
    if (!template?.id || !testEmail || !onSendTest) return;
    await onSendTest(template.id, testEmail.trim());
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template?.id ? "Редактировать шаблон" : "Новый шаблон письма"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Левая колонка — форма */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Название</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Холодное знакомство" />
              </div>
              <div>
                <Label>Категория</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Тестовый email</Label>
                <div className="flex gap-1">
                  <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="me@..." disabled={!template?.id} />
                  <Button size="icon" variant="outline" disabled={!template?.id || !testEmail} onClick={handleSendTest} title="Отправить тестовое письмо">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label>Тема письма</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Тема" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>HTML-код письма</Label>
                <div className="flex flex-wrap gap-1">
                  {COMMON_VARS.map(v => (
                    <Button key={v.v} type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => insertVar(v.v)} title={v.desc}>
                      <Variable className="w-3 h-3 mr-1" />{v.v}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={18}
                className="font-mono text-xs"
                placeholder="<p>Здравствуйте, {{name}}!</p>"
              />
            </div>
          </div>

          {/* Правая колонка — preview */}
          <div className="space-y-2">
            <Label>Предпросмотр (с подставленными примерами)</Label>
            <Card className="h-[560px] overflow-hidden">
              <CardContent className="p-0 h-full">
                <iframe
                  title="email-preview"
                  srcDoc={`<!DOCTYPE html><html><body style="margin:0;padding:16px;font-family:Arial,sans-serif">${previewHtml}</body></html>`}
                  className="w-full h-full border-0"
                  sandbox=""
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !subject.trim() || !body.trim()}>
            <Save className="w-4 h-4 mr-2" />Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
