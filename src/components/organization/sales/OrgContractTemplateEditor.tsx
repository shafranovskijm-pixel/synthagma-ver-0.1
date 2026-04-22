import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Save, Eye, History } from "lucide-react";
import DOMPurify from "dompurify";
import type { OrgContractTemplate } from "@/hooks/useOrgContracts";
import { ContractTemplateVersionsDialog } from "./ContractTemplateVersionsDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: OrgContractTemplate | null;
  onSave: (t: Partial<OrgContractTemplate> & { name: string; body_html: string }) => Promise<any>;
}

const VARS = ["client_name", "client_email", "client_inn", "amount", "date", "director", "service_name"];

export function OrgContractTemplateEditor({ open, onOpenChange, template, onSave }: Props) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(template?.name || "");
      setBody(template?.body_html || "<h1>Договор №_____</h1><p>г. Москва, {{date}}</p><p>...</p>");
    }
  }, [open, template]);

  const preview = useMemo(() => DOMPurify.sanitize(body, { USE_PROFILES: { html: true } }), [body]);

  const insertVar = (v: string) => setBody(prev => prev + ` {{${v}}}`);

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    const res = await onSave({ id: template?.id, name, body_html: body });
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{template ? `Редактировать шаблон ${template.version ? `(v${template.version})` : ""}` : "Новый шаблон договора"}</span>
            {template && (
              <Button variant="outline" size="sm" type="button" onClick={() => setHistoryOpen(true)} className="gap-1.5 mr-6">
                <History className="w-3.5 h-3.5" />История версий
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Название</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Договор оказания услуг" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Вставить переменную:</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {VARS.map(v => (
                <Button key={v} variant="outline" size="sm" type="button" onClick={() => insertVar(v)} className="text-xs h-7">
                  {`{{${v}}}`}
                </Button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">HTML</TabsTrigger>
              <TabsTrigger value="preview"><Eye className="w-3 h-3 mr-1" />Предпросмотр</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={20} className="font-mono text-xs" />
            </TabsContent>
            <TabsContent value="preview">
              <iframe srcDoc={preview} className="w-full h-[55vh] border rounded-lg bg-white" />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />Сохранить
          </Button>
        </DialogFooter>

        <ContractTemplateVersionsDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          templateId={template?.id || null}
          currentBody={body}
        />
      </DialogContent>
    </Dialog>
  );
}
