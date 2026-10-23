import{canInviteWithPolicy}from'@/lib/signatureAssurance/invitationPolicy';
import{captureSignatureAssuranceScope,readSignatureAssurance,signatureEvidenceMessages,normalizeSignatureEvidenceError}from'@/lib/signatureAssurance/client';
import{prepareBoundInvitation,policyChoiceFromVersion}from'@/lib/signatureAssurance/boundInvitation';
import type{PolicyChoice}from'@/lib/signatureAssurance/types';
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Send, User, Mail, Calendar, Loader2, Copy, ExternalLink, Building2, PenLine, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sha256Hex } from "@/utils/documentHash";
import { SignatureReadScopeProvider, useSignatureReadScope } from '@/hooks/useSignatureReadScope';
import { captureSignatureRead, signatureAuthorization } from '@/lib/signatureClientScope';

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

export function SendForSigningDialog(props: Props) {
  const scope = useSignatureReadScope([props.open, props.payload, props.recipients ?? []], props.open);
  return <SignatureReadScopeProvider value={scope.capture()}><ScopedSendForSigningDialog key={scope.key} {...props} /></SignatureReadScopeProvider>;
}

function ScopedSendForSigningDialog({ open, onOpenChange, payload, recipients = [] }: Props) {
  const scope = useSignatureReadScope([open, payload, recipients], open);
  const [tab, setTab] = useState<"registered" | "external">(recipients.length > 0 ? "registered" : "external");
  const [mode, setMode] = useState<"sign" | "review">("sign");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [extName, setExtName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [expiresDays, setExpiresDays] = useState("7");
  const [sending, setSending] = useState(false);
  const [resultLink, setResultLink] = useState<string | null>(null);
  const pending = useRef(false);
  const boundPlan=useRef<ReturnType<typeof prepareBoundInvitation>|null>(null);
  const[policyChoices,setPolicyChoices]=useState<PolicyChoice[]>([]),[selectedPolicy,setSelectedPolicy]=useState(''),[policyNext,setPolicyNext]=useState<string|null>(null),[policyError,setPolicyError]=useState<string|null>(null),[policyLoading,setPolicyLoading]=useState(false),[draftLocked,setDraftLocked]=useState(false);
  const loadPolicies=async(after:string|null=null)=>{if(!payload||!open)return;const assert=scope.capture();setPolicyLoading(true);try{const owner=captureSignatureAssuranceScope(payload.organizationId,()=>{try{assert();return true;}catch{return false;}});const response=await readSignatureAssurance(owner,{kind:'policy_list',after_id:after,limit:100});assert();if(response.result.kind!=='policy_list')return;const choices=response.result.policies.filter(p=>canInviteWithPolicy(p,payload.documentType)).map(policyChoiceFromVersion);setPolicyChoices(old=>after?[...old,...choices]:choices);setPolicyNext(response.result.next_after_id);setPolicyError(null);}catch(error){try{assert();setPolicyError(signatureEvidenceMessages[normalizeSignatureEvidenceError(error).code]);}catch{/* old owner */}}finally{try{assert();setPolicyLoading(false);}catch{/* old owner */}}};
  useEffect(()=>{boundPlan.current=null;setDraftLocked(false);setSelectedPolicy('');if(open)void loadPolicies();},[open,payload?.organizationId,payload?.documentType]);

  useEffect(() => {
    if (open) {
      setResultLink(null);
      setSelectedRecipientId("");
      setExtName("");
      setExtEmail("");
      setExpiresDays("7");
      setMode("sign");
      setTab(recipients.length > 0 ? "registered" : "external");
    }
  }, [open, recipients.length]);

  const handleSend = async () => {
    if (!payload || sending || pending.current) return;
    const current = scope.capture();
    const read = captureSignatureRead({ assertCurrent: current });

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

    pending.current = true; setSending(true);
    try {
      const { user, bearer } = await signatureAuthorization(read);
      if (!user) throw new Error("Нет авторизации");

      const documentHash = await read.wait(sha256Hex(payload.documentHtml));
      const signatureToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const days = Number(expiresDays);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('Укажите срок от 1 до 90 дней.');
      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      read.active();
      const { data: senderProfile, error: profileError } = await read.wait(supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle().setHeader('Authorization', bearer));
      if (profileError) throw new Error('Не удалось прочитать отправителя.');

      if(mode==='sign'){
        const selected=policyChoices.find(p=>p.id===selectedPolicy);if(!selected)throw new Error('Выберите принятую редакцию правил для этого документа.');
        if(!boundPlan.current){boundPlan.current=prepareBoundInvitation(payload.organizationId,()=>{try{current();return true;}catch{return false;}},{documentType:payload.documentType,documentId:payload.documentId??null,documentTitle:payload.documentTitle,documentHtml:payload.documentHtml,documentHash,senderName:senderProfile?.full_name||senderProfile?.email||null,recipientType,recipientUserId,recipientEmail,recipientName,expiresAt:expires,policyVersionId:selected.id,classification:selected.classification});setDraftLocked(true);}
        const ready=await read.wait(boundPlan.current.run());read.active();
        try{await read.wait(supabase.functions.invoke('send-signing-email',{headers:{Authorization:bearer},body:{signatureId:ready.id,recipientEmail,recipientName,documentTitle:payload.documentTitle,signatureToken:ready.signature_token}}));}catch{read.active();}
        setResultLink(window.location.origin+'/sign/'+ready.signature_token);toast.success('Правила и исходная версия закреплены; приглашение создано.');return;
      }


      read.active();
      const { data: inserted, error: insertErr } = await read.wait(supabase
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
          status: mode === "review" ? "in_review" : "sent",
          mode,
          expires_at: expires,
          sent_at: new Date().toISOString(),
        } as any)
        .select("id, signature_token")
        .single().setHeader('Authorization', bearer));

      if (insertErr || !inserted?.id || inserted.signature_token !== signatureToken) throw new Error('Создание приглашения пока не подтверждено. Проверьте журнал перед повторной отправкой.');

      // Создаём первую ревизию для режима review
      if (mode === "review") {
        const sb: any = supabase;
        read.active();
        const { data: rev, error: revisionError } = await read.wait<any>(sb
          .from("signature_revisions")
          .insert({
            signature_id: inserted.id,
            version: 1,
            document_html: payload.documentHtml,
            document_hash: documentHash,
            created_by: user.id,
            created_by_name: senderProfile?.full_name || senderProfile?.email || "Отправитель",
            change_summary: "Первая версия документа",
          })
          .select("id")
          .single().setHeader('Authorization', bearer));
        if (revisionError || !rev?.id) throw new Error('Приглашение создано, но первая версия не подтверждена. Проверьте журнал.');
        read.active();
        const updated = await read.wait<any>(sb.from("document_signatures").update({ current_revision_id: rev.id }).eq("id", inserted.id).setHeader('Authorization', bearer));
        if (updated.error) throw new Error('Приглашение создано, но выбор версии не подтверждён. Проверьте журнал.');
      }

      // Отправляем email (best-effort — если SMTP не настроен, просто покажем ссылку)
      try {
        read.active();
        await read.wait(supabase.functions.invoke("send-signing-email", {
          headers: { Authorization: bearer },
          body: {
            signatureId: inserted.id,
            recipientEmail,
            recipientName,
            documentTitle: payload.documentTitle,
            signatureToken: inserted.signature_token,
          },
        }));
      } catch {
        read.active(); // A mail failure cannot revive a link for a different actor or document.
      }

      const link = `${window.location.origin}/sign/${inserted.signature_token}`;
      read.active();
      setResultLink(link);
      toast.success("Приглашение создано");
    } catch (error: any) {
      try { current(); } catch { return; }
      toast.error("Не удалось отправить: " + (error.message || "ошибка"));
    } finally {
      pending.current = false;
      try { current(); setSending(false); } catch { /* old owner has no UI to update */ }
    }
  };

  const copyLink = async () => {
    if (!resultLink) return;
    const current = scope.capture();
    try { current(); await navigator.clipboard.writeText(resultLink); current(); toast.success("Ссылка скопирована"); }
    catch { /* Do not expose a late result in another scope. */ }
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
            Получатель сможет ознакомиться с документом и подтвердить действие. Способ подписи и основание его применения проверяются отдельно.
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
                <a href={resultLink} onClick={event => { try { scope.capture()(); } catch { event.preventDefault(); } }} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
              </Button>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Готово</Button>
          </div>
        ) : (
          <><fieldset disabled={sending||draftLocked} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Цель отправки</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "sign" | "review")} className="grid grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${mode === "sign" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <RadioGroupItem value="sign" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium"><PenLine className="w-3.5 h-3.5" />На подпись</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Подтверждение без правок документа</div>
                  </div>
                </label>
                <label className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${mode === "review" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <RadioGroupItem value="review" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium"><MessageSquareText className="w-3.5 h-3.5" />На согласование</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Можно оставлять комментарии и правки</div>
                  </div>
                </label>
              </RadioGroup>
            </div>

          {mode==='sign'&&<div className="space-y-2"><Label>Принятые правила подтверждения</Label><select className="w-full border rounded-md bg-background p-2 text-sm"value={selectedPolicy}onChange={e=>setSelectedPolicy(e.target.value)}><option value="">Выберите редакцию</option>{policyChoices.map(choice=><option key={choice.id}value={choice.id}>{choice.classification.subtype} · версия {choice.version} · {choice.method==='authenticated_account_confirmation'?'Учётная запись':choice.method==='scan_received'?'Бумажный скан':choice.method==='bearer_invitation_confirmation'?'Подтверждение по ссылке':'Графический макет'}</option>)}</select>{policyLoading&&<p className="text-xs">Загружаем редакции…</p>}{policyError&&<p className="text-sm text-destructive">{policyError}</p>}{policyNext&&<Button size="sm"variant="outline"type="button"disabled={policyLoading}onClick={()=>void loadPolicies(policyNext)}>Показать ещё редакции</Button>}<p className="text-xs text-muted-foreground">До отправки фиксируются точная редакция правил и исходная версия документа. Графический макет фиксируется отдельно в журнале и не является подтверждением получателя. Если подходящей редакции нет, подготовьте и примите её в журнале подтверждений.</p></div>}
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
              <Button onClick={handleSend} disabled={sending||(mode==="sign"&&!selectedPolicy)} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {mode === "review" ? "Отправить на согласование" : "Отправить на подпись"}
              </Button>
            </DialogFooter>
          </Tabs>
          </fieldset>
          {draftLocked&&<div className="space-y-2"><p className="text-xs text-muted-foreground">Сохранён один черновик приглашения. При неясном ответе продолжите тот же запрос; новое приглашение не создаётся.</p><Button disabled={sending}onClick={()=>void handleSend()}>{sending?'Проверяем…':'Продолжить сохранённое приглашение'}</Button></div>}</>
        )}
      </DialogContent>
    </Dialog>
  );
}
