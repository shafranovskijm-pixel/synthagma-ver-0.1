import{canInviteWithPolicy}from'@/lib/signatureAssurance/invitationPolicy';
import{SignatureReadScopeProvider,useSignatureReadScope}from'@/hooks/useSignatureReadScope';
import{captureSignatureRead,signatureAuthorization}from'@/lib/signatureClientScope';
import{captureSignatureAssuranceScope,readSignatureAssurance,signatureEvidenceMessages,normalizeSignatureEvidenceError}from'@/lib/signatureAssurance/client';
import{prepareBoundInvitation,policyChoiceFromVersion}from'@/lib/signatureAssurance/boundInvitation';
import type{PolicyChoice}from'@/lib/signatureAssurance/types';
/**
 * Массовая отправка с отдельно выбранными правилами и фактическими подтверждениями.
 * Используется для рассылок типовых договоров, согласий, актов сразу пачке учеников или компаний.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Search, Users, CheckCircle2, AlertCircle, Building2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sha256Hex } from "@/utils/documentHash";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SendForSigningPayload } from "./SendForSigningDialog";

interface BulkRecipient {
  id: string;
  name: string;
  email: string;
  type: "student" | "company";
  user_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SendForSigningPayload | null;
  organizationId: string;
}

interface Result {
  recipient: BulkRecipient;
  ok: boolean;
  error?: string;
  emailSent?: boolean;
}

export function BulkSendForSigningDialog(props:Props){const owner=useSignatureReadScope([props.open,props.payload,props.organizationId],props.open);return<SignatureReadScopeProvider value={owner.capture()}><ScopedBulkSendForSigningDialog key={owner.key}{...props}/></SignatureReadScopeProvider>;}
function ScopedBulkSendForSigningDialog({open,onOpenChange,payload,organizationId}:Props){
 const scope=useSignatureReadScope([open,payload,organizationId],open),pending=useRef(false),plans=useRef(new Map<string,{recipient:BulkRecipient;plan:ReturnType<typeof prepareBoundInvitation>;done:boolean;emailSent?:boolean}>());
 const[choices,setChoices]=useState<PolicyChoice[]>([]),[choiceId,setChoiceId]=useState(''),[choiceAfter,setChoiceAfter]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[locked,setLocked]=useState(false);
 const loadPolicies=async(after:string|null=null)=>{if(!payload||!open)return;const assert=scope.capture();try{const own=captureSignatureAssuranceScope(organizationId,()=>{try{assert();return true;}catch{return false;}});const result=await readSignatureAssurance(own,{kind:'policy_list',after_id:after,limit:100});assert();if(result.result.kind!=='policy_list')return;const values=result.result.policies.filter(p=>canInviteWithPolicy(p,payload.documentType)).map(policyChoiceFromVersion);setChoices(old=>after?[...old,...values]:values);setChoiceAfter(result.result.next_after_id);}catch(error){try{assert();setNotice(signatureEvidenceMessages[normalizeSignatureEvidenceError(error).code]);}catch{/* old owner */}}};
  const [recipients, setRecipients] = useState<BulkRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "student" | "company">("all");
  const [expiresDays, setExpiresDays] = useState("7");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

 useEffect(()=>{if(!open||!payload)return;const assert=scope.capture(),read=captureSignatureRead({assertCurrent:assert});setSelectedIds(new Set());setSearch('');setResults(null);setProgress(null);setRecipients([]);setChoices([]);setChoiceId('');setLocked(false);plans.current.clear();void loadPolicies();
 const load=async()=>{setLoadingRecipients(true);try{const{bearer}=await signatureAuthorization(read);const all:BulkRecipient[]=[];let total=0;
 for(let start=0;;start+=500){const result=await read.wait(supabase.from('companies').select('id,name,login_email,email,user_id').eq('organization_id',organizationId).order('id').range(start,start+499).setHeader('Authorization',bearer));if(result.error)throw result.error;for(const c of result.data??[]){const email=c.login_email||c.email;if(email)all.push({id:'company-'+c.id,name:c.name,email,type:'company',user_id:c.user_id});}total+=(result.data??[]).length;if(total>10000)throw Error('Список компаний превышает 10 000. Выберите отдельную группу для отправки.');if((result.data??[]).length<500)break;}
 const people=new Set<string>();for(let start=0;;start+=500){const result=await read.wait(supabase.from('enrollments').select('id,user_id,courses!inner(organization_id)').eq('courses.organization_id',organizationId).order('id').range(start,start+499).setHeader('Authorization',bearer));if(result.error)throw result.error;for(const e of result.data??[])people.add(e.user_id);if(start+(result.data??[]).length>10000)throw Error('Список назначений превышает 10 000. Выберите отдельную группу для отправки.');if((result.data??[]).length<500)break;}
 const ids=[...people].sort();for(let start=0;start<ids.length;start+=100){const result=await read.wait(supabase.from('profiles').select('user_id,full_name,email').in('user_id',ids.slice(start,start+100)).setHeader('Authorization',bearer));if(result.error)throw result.error;for(const p of result.data??[])if(p.email)all.push({id:'student-'+p.user_id,name:p.full_name||p.email,email:p.email,type:'student',user_id:p.user_id});}read.active();setRecipients(all);setLoadingRecipients(false);
 }catch(error){try{assert();setRecipients([]);setLoadingRecipients(false);setNotice('Не удалось проверить полный список доступных получателей.');}catch{/* old owner */}}};void load();
 },[open,organizationId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return recipients.filter(r => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    });
  }, [recipients, search, filterType]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));

  const toggleAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(r => next.delete(r.id));
      } else {
        filtered.forEach(r => next.add(r.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

 const handleSend=async()=>{if(!payload||sending||pending.current)return;const assert=scope.capture(),read=captureSignatureRead({assertCurrent:assert});const choice=choices.find(p=>p.id===choiceId);if(!choice){toast.error('Выберите принятую редакцию правил.');return;}const selected=recipients.filter(r=>selectedIds.has(r.id));if(!plans.current.size&&!selected.length){toast.error('Не выбран ни один получатель.');return;}const days=Number(expiresDays);if(!Number.isInteger(days)||days<1||days>90){toast.error('Укажите срок от 1 до 90 дней.');return;}
 pending.current=true;setSending(true);setNotice(null);try{if(payload.organizationId!==organizationId)throw Error('Организация документа изменилась.');const{user,bearer}=await signatureAuthorization(read);const documentHash=await read.wait(sha256Hex(payload.documentHtml));const profile=await read.wait(supabase.from('profiles').select('full_name,email').eq('user_id',user.id).maybeSingle().setHeader('Authorization',bearer));if(profile.error)throw profile.error;const sender=profile.data?.full_name||profile.data?.email||null;
 if(!plans.current.size){const expiresAt=new Date(Date.now()+days*86400000).toISOString();for(const r of selected)plans.current.set(r.id,{recipient:r,done:false,plan:prepareBoundInvitation(organizationId,()=>{try{assert();return true;}catch{return false;}},{documentType:payload.documentType,documentId:payload.documentId??null,documentTitle:payload.documentTitle,documentHtml:payload.documentHtml,documentHash,senderName:sender,recipientType:r.type,recipientUserId:r.user_id??null,recipientEmail:r.email,recipientName:r.name,expiresAt,policyVersionId:choice.id,classification:choice.classification})});setLocked(true);}
 const outcomes:Result[]=[];setProgress({done:0,total:plans.current.size});for(const task of plans.current.values()){read.active();if(!task.done)try{const ready=await read.wait(task.plan.run());task.done=true;try{const mail=await read.wait(supabase.functions.invoke('send-signing-email',{headers:{Authorization:bearer},body:{signatureId:ready.id,recipientEmail:task.recipient.email,recipientName:task.recipient.name,documentTitle:payload.documentTitle,signatureToken:ready.signature_token}}));task.emailSent=!mail.error&&mail.data?.success===true;}catch{read.active();task.emailSent=false;}outcomes.push({recipient:task.recipient,ok:true,emailSent:task.emailSent});}catch(error){read.active();outcomes.push({recipient:task.recipient,ok:false,error:signatureEvidenceMessages[normalizeSignatureEvidenceError(error).code]});}else outcomes.push({recipient:task.recipient,ok:true,emailSent:task.emailSent});read.active();setProgress({done:outcomes.length,total:plans.current.size});}read.active();setResults(outcomes);const ok=outcomes.filter(v=>v.ok).length;toast.success('Приглашений создано: '+ok+' из '+outcomes.length+'.');
 }catch(error){try{assert();setNotice(signatureEvidenceMessages[normalizeSignatureEvidenceError(error).code]);}catch{/* old owner */}}finally{pending.current=false;try{assert();setSending(false);}catch{/* old owner */}}};

  if (!payload) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Массовая отправка на подписание
            </DialogTitle>
            <DialogDescription>
              Чтобы запустить массовую рассылку, откройте нужный шаблон в Конструкторе договоров или выберите готовый документ в карточке контрагента и нажмите «Массовая отправка».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Массовая отправка на подписание
          </DialogTitle>
          <DialogDescription>
            {payload?.documentTitle && <span className="font-medium text-foreground">{payload.documentTitle}</span>}
            <br />
            Каждому получателю будет создана отдельная ссылка с собственным токеном. Письмо отправляется отдельно; создание приглашения не подтверждает доставку.
          </DialogDescription>
        </DialogHeader>

        {notice&&<p className="text-sm text-destructive"role="alert">{notice}</p>}
        {results ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="text-sm font-medium">Результаты создания приглашений</div>
            <ScrollArea className="flex-1 border rounded-lg p-2">
              <div className="space-y-1">
                {results.map((r) => (
                  <div key={r.recipient.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    {r.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.recipient.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.recipient.email}</div>
                    </div>
                    {r.ok&&<span className="text-xs text-muted-foreground">{r.emailSent?'Письмо передано почтовому серверу; доставка не подтверждена.':'Приглашение создано; отправка письма не подтверждена.'}</span>}{!r.ok && r.error && (
                      <span className="text-xs text-destructive">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              {results.some(result=>!result.ok)&&<Button variant="outline"disabled={sending}onClick={()=>void handleSend()}>Продолжить только неудавшиеся приглашения</Button>}
              <Button onClick={() => onOpenChange(false)}>Готово</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-2"><Label>Принятые правила подтверждения</Label><select className="w-full border rounded bg-background p-2 text-sm"value={choiceId}onChange={e=>setChoiceId(e.target.value)}disabled={sending||locked}><option value="">Выберите редакцию</option>{choices.map(p=><option key={p.id}value={p.id}>{p.classification.subtype} · версия {p.version}</option>)}</select>{choiceAfter&&<Button type="button"variant="outline"size="sm"disabled={sending||locked}onClick={()=>void loadPolicies(choiceAfter)}>Показать ещё редакции</Button>}<p className="text-xs text-muted-foreground">Каждое приглашение сначала сохраняется черновиком; ссылка активируется после закрепления точной версии документа и правил.</p></div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени или email"
                  className="pl-9"
                  disabled={sending||locked}
                />
              </div>
              <div className="flex gap-1">
                {(["all", "company", "student"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={cn(
                      "px-2.5 py-1.5 text-xs rounded-lg border transition-colors",
                      filterType === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border hover:bg-muted"
                    )}
                  >
                    {t === "all" ? "Все" : t === "company" ? "Компании" : "Ученики"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} disabled={sending||locked} />
              <span>Выбрать всех ({filtered.length})</span>
              <span className="ml-auto">
                <Badge variant="secondary">{selectedIds.size} выбрано</Badge>
              </span>
            </div>

            <ScrollArea className="flex-1 border rounded-lg min-h-[200px] max-h-[40vh]">
              {loadingRecipients ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Загрузка получателей...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Получатели не найдены</div>
              ) : (
                <div className="p-1">
                  {filtered.map((r) => {
                    const checked = selectedIds.has(r.id);
                    return (
                      <label
                        key={r.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                          checked && "bg-primary/5"
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} disabled={sending||locked} />
                        {r.type === "company" ? (
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <div className="space-y-1.5">
              <Label className="text-xs">Срок действия ссылки (дней)</Label>
              <Input type="number" min={1} max={90} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} disabled={sending||locked} className="w-32" />
            </div>

            {progress && (
              <div className="text-sm text-muted-foreground">
                Обработано {progress.done} из {progress.total}…
              </div>
            )}

            {locked&&<Button disabled={sending}onClick={()=>void handleSend()}>Продолжить сохранённую отправку</Button>}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending||locked}>Отмена</Button>
              <Button onClick={handleSend} disabled={sending||!choiceId||selectedIds.size===0} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Отправить ({selectedIds.size})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
