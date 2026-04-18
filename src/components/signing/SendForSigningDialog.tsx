import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, User, Mail, Calendar, Loader2, Copy, ExternalLink, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sha256Hex } from "@/utils/documentHash";

export type SigningRecipientType = "student" | "company" | "individual";

export interface SendForSigningPayload {
  documentType: "contract" | "consent" | "act" | "order" | "custom_pdf" | "education_document";
  documentTitle: string;
  documentHtml: string;
  documentId?: string | null;
  organizationId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SendForSigningPayload | null;
  /** Опциональный список зарегистрированных получателей (учеников/компаний) */
  recipients?: { id: string; name: string; email: string; type: SigningRecipientType }[];
}

export function SendForSigningDialog({ open, onOpenChange, payload, recipients = [] }: Props) {
  const [tab, setTab] = useState<"registered" | "external">(recipients.length > 0 ? "registered" : "external");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [extName, setExtName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [expiresDays, setExpiresDays] = useState("7");
  const [sending, setSending] = useState(false);
  const [resultLink, setResultLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setResultLink(null);
      setSelectedRecipientId("");
      setExtName("");
      setExtEmail("");
      setExpiresDays("7");
      setTab(recipients.length > 0 ? "registered" : "external");
    }
  }, [open, recipients.length]);

  const handleSend = async () => {
    if (!payload) return;

    let recipientName = "";
    let recipientEmail = "";
    let recipientType: SigningRecipientType = "individual";
    let recipientUserId: string | null = null;

    if (tab === "registered") {
      const r = recipients.find((x) => x.id === selectedRecipientId);
      if (!r) { toast.error("Выберите получателя"); return; }
      recipientName = r.name;
      recipientEmail = r.email;
      recipientType = r.type;
      recipientUserId = r.id;
    } else {
      if (!extName.trim() || !extEmail.trim()) { toast.error("Заполните ФИО и email получателя"); return; }
      recipientName = extName.trim();
      recipientEmail = extEmail.trim();
      recipientType = "individual";
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Нет авторизации");

      const documentHash = await sha256Hex(payload.documentHtml);
      const signatureToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const expires = new Date(Date.now() + Number(expiresDays || 7) * 24 * 60 * 60 * 1000).toISOString();

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: inserted, error: insertErr } = await supabase
        .from("document_signatures")
        .insert({
          document_type: payload.documentType,
          document_id: payload.documentId ?? null,
          document_title: payload.documentTitle,
          document_html: payload.documentHtml,
          document_hash: documentHash,
          organization_id: payload.organizationId,
          sender_user_id: user.id,
          sender_name: senderProfile?.full_name || senderProfile?.email || null,
          recipient_type: recipientType,
          recipient_user_id: recipientUserId,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          signature_token: signatureToken,
          status: "sent",
          expires_at: expires,
          sent_at: new Date().toISOString(),
        })
        .select("id, signature_token")
        .single();

      if (insertErr) throw insertErr;

      // Отправляем email (best-effort — если SMTP не настроен, просто покажем ссылку)
      try {
        await supabase.functions.invoke("send-signing-email", {
          body: {
            signatureId: inserted.id,
            recipientEmail,
            recipientName,
            documentTitle: payload.documentTitle,
            signatureToken: inserted.signature_token,
          },
        });
      } catch (e) {
        console.warn("send-signing-email failed:", e);
      }

      const link = `${window.location.origin}/sign/${inserted.signature_token}`;
      setResultLink(link);
      toast.success("Документ отправлен на подписание");
    } catch (error: any) {
      console.error(error);
      toast.error("Не удалось отправить: " + (error.message || "ошибка"));
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    if (!resultLink) return;
    navigator.clipboard.writeText(resultLink);
    toast.success("Ссылка скопирована");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Отправить на подписание
          </DialogTitle>
          <DialogDescription>
            {payload?.documentTitle ? <span className="font-medium text-foreground">{payload.documentTitle}</span> : "Документ"}
            <br />
            Получатель сможет ознакомиться, принять Соглашение о ПЭП и подписать документ простой электронной подписью.
          </DialogDescription>
        </DialogHeader>

        {resultLink ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm">
              ✅ Ссылка для подписания создана. Если получатель не получит письмо, отправьте ссылку вручную.
            </div>
            <div className="flex gap-2">
              <Input value={resultLink} readOnly className="text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink}><Copy className="w-4 h-4" /></Button>
              <Button variant="outline" size="icon" asChild>
                <a href={resultLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
              </Button>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Готово</Button>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="registered" disabled={recipients.length === 0} className="gap-2">
                <User className="w-4 h-4" />Зарегистрированные
              </TabsTrigger>
              <TabsTrigger value="external" className="gap-2">
                <Mail className="w-4 h-4" />По email
              </TabsTrigger>
            </TabsList>

            <TabsContent value="registered" className="space-y-3 pt-3">
              <Label>Получатель</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedRecipientId}
                onChange={(e) => setSelectedRecipientId(e.target.value)}
              >
                <option value="">— Выберите —</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.email}) — {r.type === "company" ? "Компания" : "Ученик"}
                  </option>
                ))}
              </select>
            </TabsContent>

            <TabsContent value="external" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />ФИО получателя</Label>
                <Input value={extName} onChange={(e) => setExtName(e.target.value)} placeholder="Иванов Иван Иванович" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Email получателя</Label>
                <Input type="email" value={extEmail} onChange={(e) => setExtEmail(e.target.value)} placeholder="ivanov@example.com" />
              </div>
            </TabsContent>

            <div className="space-y-2 pt-3">
              <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Срок действия ссылки (дней)</Label>
              <Input type="number" min={1} max={90} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Отмена</Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Отправить
              </Button>
            </DialogFooter>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
