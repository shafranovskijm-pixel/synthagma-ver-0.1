import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Send, Eye } from "lucide-react";
import { useOrgContractTemplates, useOrgContracts } from "@/hooks/useOrgContracts";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import DOMPurify from "dompurify";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  prefill?: {
    documentTitle?: string;
    recipientName?: string;
    recipientEmail?: string;
    bodyHtml?: string;
    linkedProposalId?: string;
  };
}

export function CreateContractDialog({ open, onOpenChange, organizationId, prefill }: Props) {
  const { templates: contractTpls } = useOrgContractTemplates(organizationId);
  const { templates: emailTpls } = useEmailTemplates("org", organizationId);
  const { create } = useOrgContracts(organizationId);

  const [tplId, setTplId] = useState<string>("");
  const [emailTplId, setEmailTplId] = useState<string>("");
  const [docTitle, setDocTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const contractEmailTpls = useMemo(
    () => emailTpls.filter(t => t.category === "contract"),
    [emailTpls]
  );

  useEffect(() => {
    if (open) {
      setDocTitle(prefill?.documentTitle || "");
      setRecipientName(prefill?.recipientName || "");
      setRecipientEmail(prefill?.recipientEmail || "");
      setBody(prefill?.bodyHtml || "");
      setTplId("");
      setEmailTplId(contractEmailTpls[0]?.id || "");
      setVars({});
    }
  }, [open, prefill, contractEmailTpls]);

  const onSelectTpl = (id: string) => {
    setTplId(id);
    const t = contractTpls.find(x => x.id === id);
    if (t) {
      setBody(t.body_html);
      if (!docTitle) setDocTitle(t.name);
    }
  };

  const finalHtml = useMemo(() => {
    let h = body;
    Object.entries(vars).forEach(([k, v]) => {
      h = h.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || "");
    });
    h = h
      .replace(/\{\{client_name\}\}/g, recipientName || "")
      .replace(/\{\{client_email\}\}/g, recipientEmail || "")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString("ru-RU"));
    return DOMPurify.sanitize(h, { USE_PROFILES: { html: true } });
  }, [body, vars, recipientName, recipientEmail]);

  const onSend = async () => {
    if (!docTitle.trim() || !recipientEmail.trim() || !recipientName.trim() || !body.trim()) {
      toast.error("Заполните название, контрагента и текст договора");
      return;
    }
    setSending(true);
    const res = await create({
      documentTitle: docTitle,
      documentHtml: finalHtml,
      recipientName,
      recipientEmail,
      templateEmailId: emailTplId || null,
      linkedProposalId: prefill?.linkedProposalId,
    });
    setSending(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Отправить договор на подписание</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="setup">
          <TabsList>
            <TabsTrigger value="setup">Настройка</TabsTrigger>
            <TabsTrigger value="preview"><Eye className="w-4 h-4 mr-1" />Предпросмотр</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Шаблон договора</Label>
                <Select value={tplId} onValueChange={onSelectTpl}>
                  <SelectTrigger><SelectValue placeholder="— Без шаблона —" /></SelectTrigger>
                  <SelectContent>
                    {contractTpls.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Шаблон письма (категория «Отправка договора»)</Label>
                <Select value={emailTplId} onValueChange={setEmailTplId}>
                  <SelectTrigger><SelectValue placeholder="— Стандартное —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Стандартное —</SelectItem>
                    {contractEmailTpls.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Название документа</Label>
              <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="Договор оказания услуг №..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Имя/название контрагента</Label>
                <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="ООО «Ромашка»" />
              </div>
              <div className="space-y-1">
                <Label>Email контрагента</Label>
                <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>HTML договора</Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={14} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">
                Доступные переменные: <code>{"{{client_name}}"}</code>, <code>{"{{client_email}}"}</code>, <code>{"{{date}}"}</code> и любые свои.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <iframe srcDoc={finalHtml} className="w-full h-[60vh] border rounded-lg bg-white" />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={onSend} disabled={sending} className="gap-2">
            <Send className="w-4 h-4" />
            {sending ? "Отправка..." : "Отправить на подписание"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
