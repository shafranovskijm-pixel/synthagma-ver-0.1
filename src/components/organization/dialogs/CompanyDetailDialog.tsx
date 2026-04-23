import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Edit, Trash2, Eye, EyeOff, GraduationCap, UserPlus, Link2,
  FileText, Receipt, FileCheck, ChevronRight, Plus, Download, X,
  CheckCircle2, Clock, Banknote, Calendar, KeyRound, Copy,
  Loader2 as Loader2Icon, Send, MessageSquare, Inbox, Scale,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DocumentDropZone } from "../DocumentDropZone";
import type { Company, CompanyDocument } from "@/hooks/useCompaniesManager";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CompanyDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  documents: CompanyDocument[];
  isLoadingDocuments: boolean;
  isUploadingDocument: string | null;
  isDeletingDocument: string | null;
  onEdit: (company: Company) => void;
  onDelete: (company: Company) => void;
  onViewStudents: (company: Company) => void;
  onBulkAssign: (company: Company) => void;
  onOpenLinks: (company: Company) => void;
  onBulkEnroll: (company: Company) => void;
  onOpenContractGenerator: (company: Company) => void;
  onOpenInvoiceGenerator: (company: Company) => void;
  onOpenActGenerator: (company: Company) => void;
  onOpenReconciliation?: (company: Company) => void;
  onUploadDocument: (type: 'contract' | 'invoice' | 'act', file: File) => void;
  onViewDocument: (doc: CompanyDocument) => void;
  onDownloadDocument: (doc: CompanyDocument) => void;
  onDeleteDocument: (doc: CompanyDocument) => void;
  onTogglePaid: (doc: CompanyDocument) => void;
}

export function CompanyDetailDialog(props: CompanyDetailDialogProps) {
  const { open, onOpenChange, company, documents, isLoadingDocuments, isUploadingDocument, isDeletingDocument } = props;

  if (!company) return null;

  const getDocumentsByType = (type: 'contract' | 'invoice' | 'act') => documents.filter(doc => doc.type === type);
  const stats = getDocumentStats(documents);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl w-[95vw] max-w-6xl h-[90vh] overflow-hidden flex flex-col p-0">
        <CompanyHeader company={company} stats={stats} onEdit={props.onEdit} onDelete={props.onDelete} onOpenChange={onOpenChange} />

        <Tabs defaultValue="documents" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
            <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10"><FileText className="w-4 h-4 mr-2" />Документы</TabsTrigger>
            <TabsTrigger value="requests" className="rounded-lg data-[state=active]:bg-primary/10"><Send className="w-4 h-4 mr-2" />Заявки</TabsTrigger>
            <TabsTrigger value="access" className="rounded-lg data-[state=active]:bg-primary/10"><KeyRound className="w-4 h-4 mr-2" />Доступ</TabsTrigger>
            <TabsTrigger value="actions" className="rounded-lg data-[state=active]:bg-primary/10">Действия</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="requests" className="m-0"><CompanyRequestsOrgView companyId={company.id} /></TabsContent>
            <TabsContent value="access" className="m-0"><CompanyAccessTab company={company} /></TabsContent>
            <TabsContent value="actions" className="m-0 space-y-4"><ActionsGrid company={company} {...props} /></TabsContent>
            <TabsContent value="documents" className="m-0">
              {isLoadingDocuments ? (
                <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
              ) : (
                <div className="grid grid-cols-3 gap-6">
                  <DocumentSection title="Договоры" icon={<FileText className="w-5 h-5 text-orange-500" />} iconBg="bg-orange-500/10" documents={getDocumentsByType('contract')} type="contract" isUploading={isUploadingDocument === 'contract'} isDeletingDocument={isDeletingDocument} onCreateClick={() => props.onOpenContractGenerator(company)} onUpload={(file) => props.onUploadDocument('contract', file)} onView={props.onViewDocument} onDownload={props.onDownloadDocument} onDelete={props.onDeleteDocument} formatDate={formatDate} />
                  <DocumentSection title="Счета" icon={<Receipt className="w-5 h-5 text-blue-500" />} iconBg="bg-blue-500/10" documents={getDocumentsByType('invoice')} type="invoice" isUploading={isUploadingDocument === 'invoice'} isDeletingDocument={isDeletingDocument} onCreateClick={() => props.onOpenInvoiceGenerator(company)} onUpload={(file) => props.onUploadDocument('invoice', file)} onView={props.onViewDocument} onDownload={props.onDownloadDocument} onDelete={props.onDeleteDocument} onTogglePaid={props.onTogglePaid} formatDate={formatDate} />
                  <DocumentSection title="Акты" icon={<FileCheck className="w-5 h-5 text-sigma-green" />} iconBg="bg-sigma-green/10" documents={getDocumentsByType('act')} type="act" isUploading={isUploadingDocument === 'act'} isDeletingDocument={isDeletingDocument} onCreateClick={() => props.onOpenActGenerator(company)} onUpload={(file) => props.onUploadDocument('act', file)} onView={props.onViewDocument} onDownload={props.onDownloadDocument} onDelete={props.onDeleteDocument} formatDate={formatDate} />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──

function getDocumentStats(documents: CompanyDocument[]) {
  const contracts = documents.filter(d => d.type === 'contract');
  const invoices = documents.filter(d => d.type === 'invoice');
  const acts = documents.filter(d => d.type === 'act');
  const paidInvoices = invoices.filter(d => d.is_paid);
  const unpaidInvoices = invoices.filter(d => !d.is_paid);
  return {
    contracts: contracts.length,
    invoices: invoices.length,
    acts: acts.length,
    paidInvoices: paidInvoices.length,
    unpaidInvoices: unpaidInvoices.length,
    paidAmount: paidInvoices.reduce((sum, d) => sum + (d.amount || 0), 0),
    unpaidAmount: unpaidInvoices.reduce((sum, d) => sum + (d.amount || 0), 0),
  };
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Sub-components ──

function CompanyHeader({ company, stats, onEdit, onDelete, onOpenChange }: { company: Company; stats: ReturnType<typeof getDocumentStats>; onEdit: (c: Company) => void; onDelete: (c: Company) => void; onOpenChange: (o: boolean) => void }) {
  return (
    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center"><Building2 className="w-7 h-7 text-primary" /></div>
          <div>
            <h2 className="font-display text-xl font-bold">{company.name}</h2>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
              {company.inn && <span>ИНН: {company.inn}</span>}
              {company.kpp && <span>КПП: {company.kpp}</span>}
              {company.ogrn && <span>ОГРН: {company.ogrn}</span>}
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(company.created_at).toLocaleDateString("ru-RU")}</span>
            </div>
            {company.director && <div className="text-sm text-muted-foreground mt-1"><span className="text-foreground/70">Руководитель:</span> {company.director}</div>}
            {company.email && <div className="text-xs text-muted-foreground mt-1"><span className="text-foreground/70">Email:</span> {company.email}</div>}
            {company.address && <div className="text-xs text-muted-foreground mt-1 max-w-xl truncate" title={company.address}><span className="text-foreground/70">Адрес:</span> {company.address}</div>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => { onOpenChange(false); onEdit(company); }}><Edit className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="rounded-xl text-destructive hover:text-destructive" onClick={() => { onOpenChange(false); onDelete(company); }}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mt-5">
        <StatCard icon={<FileText className="w-3.5 h-3.5" />} label="Договоры" value={stats.contracts} />
        <StatCard icon={<Receipt className="w-3.5 h-3.5" />} label="Счета" value={stats.invoices} />
        <StatCard icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Оплачено" value={stats.paidInvoices} amount={stats.paidAmount} className="text-green-500" />
        <StatCard icon={<Clock className="w-3.5 h-3.5" />} label="Не оплачено" value={stats.unpaidInvoices} amount={stats.unpaidAmount} className="text-amber-500" />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, amount, className = "text-muted-foreground" }: { icon: React.ReactNode; label: string; value: number; amount?: number; className?: string }) {
  return (
    <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
      <div className={`flex items-center gap-2 ${className} text-xs mb-1`}>{icon}{label}</div>
      <div className={`text-xl font-bold ${className !== "text-muted-foreground" ? className : ""}`}>{value}</div>
      {amount !== undefined && amount > 0 && <div className="text-xs text-muted-foreground">{new Intl.NumberFormat('ru-RU').format(amount)} ₽</div>}
    </div>
  );
}

function ActionsGrid({ company, onOpenChange, onViewStudents, onBulkAssign, onOpenLinks, onBulkEnroll, onOpenReconciliation }: CompanyDetailDialogProps) {
  const actions = [
    { icon: Eye, label: "Просмотр учеников", desc: "Список и прогресс", color: "bg-primary/10", iconColor: "text-primary", onClick: () => { onOpenChange(false); onViewStudents(company!); } },
    { icon: UserPlus, label: "Назначить учеников", desc: "Добавить в компанию", color: "bg-sigma-green/10", iconColor: "text-sigma-green", onClick: () => { onOpenChange(false); onBulkAssign(company!); } },
    { icon: Link2, label: "Ссылки для регистрации", desc: "Управление ссылками", color: "bg-blue-500/10", iconColor: "text-blue-500", onClick: () => { onOpenChange(false); onOpenLinks(company!); } },
    { icon: GraduationCap, label: "Зачислить на курсы", desc: "Массовое зачисление", color: "bg-orange-500/10", iconColor: "text-orange-500", onClick: () => { onOpenChange(false); onBulkEnroll(company!); } },
    ...(onOpenReconciliation ? [{ icon: Scale, label: "Акт сверки", desc: "Сальдо за период по счетам и платежам", color: "bg-amber-500/10", iconColor: "text-amber-500", onClick: () => { onOpenChange(false); onOpenReconciliation(company!); } }] : []),
    { icon: Eye, label: "Личный кабинет компании", desc: company?.user_id ? "Просмотр от лица компании" : "У компании нет учётной записи", color: "bg-primary/10", iconColor: "text-primary", disabled: !company?.user_id, onClick: () => { localStorage.setItem('orgViewAsCompany', JSON.stringify({ companyId: company!.id, companyName: company!.name, userId: company!.user_id })); window.open('/company', '_blank'); } },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a, i) => (
        <button key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group" onClick={a.onClick} disabled={a.disabled}>
          <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center group-hover:opacity-80 transition-colors`}>
            <a.icon className={`w-5 h-5 ${a.iconColor}`} />
          </div>
          <div className="flex-1"><div className="font-medium">{a.label}</div><div className="text-xs text-muted-foreground">{a.desc}</div></div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      ))}
    </div>
  );
}

// ── Document Section ──

interface DocumentSectionProps {
  title: string; icon: React.ReactNode; iconBg: string;
  documents: CompanyDocument[]; type: 'contract' | 'invoice' | 'act';
  isUploading: boolean; isDeletingDocument: string | null;
  onCreateClick: () => void; onUpload: (file: File) => void;
  onView: (doc: CompanyDocument) => void; onDownload: (doc: CompanyDocument) => void;
  onDelete: (doc: CompanyDocument) => void; onTogglePaid?: (doc: CompanyDocument) => void;
  formatDate: (dateString: string) => string;
}

function DocumentSection({ title, icon, iconBg, documents, type, isUploading, isDeletingDocument, onCreateClick, onUpload, onView, onDownload, onDelete, onTogglePaid, formatDate }: DocumentSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">{icon}<h3 className="font-semibold">{title}</h3><span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{documents.length}</span></div>
      <Button variant="outline" className="w-full rounded-xl gap-2 border-dashed" onClick={onCreateClick}><Plus className="w-4 h-4" />Создать {title.toLowerCase().slice(0, -1)}</Button>
      <DocumentDropZone type={type} isUploading={isUploading} onUpload={onUpload} />
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {documents.map((doc) => (
          <DocumentItem key={doc.id} doc={doc} type={type} iconBg={iconBg} isDeletingDocument={isDeletingDocument} onView={onView} onDownload={onDownload} onDelete={onDelete} onTogglePaid={onTogglePaid} formatDate={formatDate} />
        ))}
      </div>
    </div>
  );
}

function DocumentItem({ doc, type, iconBg, isDeletingDocument, onView, onDownload, onDelete, onTogglePaid, formatDate }: { doc: CompanyDocument; type: string; iconBg: string; isDeletingDocument: string | null; onView: (d: CompanyDocument) => void; onDownload: (d: CompanyDocument) => void; onDelete: (d: CompanyDocument) => void; onTogglePaid?: (d: CompanyDocument) => void; formatDate: (s: string) => string }) {
  const isInvoice = type === 'invoice';
  const isPaid = doc.is_paid;
  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${isInvoice && isPaid ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-card hover:bg-secondary/30'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isInvoice && isPaid ? 'bg-green-500/10' : iconBg}`}>
        {isInvoice && isPaid ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : type === 'contract' ? <FileText className="w-4 h-4 text-orange-500" /> : type === 'invoice' ? <Receipt className="w-4 h-4 text-blue-500" /> : <FileCheck className="w-4 h-4 text-sigma-green" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-xs truncate">{doc.name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {doc.amount && <span className="font-medium">{new Intl.NumberFormat('ru-RU').format(doc.amount)} ₽</span>}
          <span>• {formatDate(doc.uploaded_at)}</span>
          {isInvoice && isPaid && doc.paid_at && <span className="text-green-600">• Оплачен {format(new Date(doc.paid_at), "dd.MM.yy", { locale: ru })}</span>}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        {isInvoice && onTogglePaid && (
          <Button variant="ghost" size="icon" className={`rounded-lg h-7 w-7 ${isPaid ? 'text-green-500 hover:text-green-600' : 'text-muted-foreground hover:text-green-500'}`} onClick={() => onTogglePaid(doc)} title={isPaid ? "Отметить как неоплачено" : "Отметить как оплачено"}>
            {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="rounded-lg h-7 w-7 text-primary hover:text-primary" onClick={() => onView(doc)} title="Просмотреть"><Eye className="w-3 h-3" /></Button>
        <Button variant="ghost" size="icon" className="rounded-lg h-7 w-7" onClick={() => onDownload(doc)} title="Скачать"><Download className="w-3 h-3" /></Button>
        <Button variant="ghost" size="icon" className="rounded-lg h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(doc)} disabled={isDeletingDocument === doc.id}>
          {isDeletingDocument === doc.id ? <SigmaSpinner size="xs" /> : <X className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

// ── Access Tab ──

function CompanyAccessTab({ company }: { company: Company }) {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState(company.email || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState<{ login_email: string; login_password: string } | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const hasAccount = !!(company as any).user_id;

  const loadCredentials = useCallback(async () => {
    if (!hasAccount) return;
    setLoadingCreds(true);
    try {
      const { data } = await supabase.rpc('get_decrypted_company_credentials', { p_company_id: company.id });
      if (data && data.length > 0) setCredentials(data[0]);
    } catch (e) { console.error(e); } finally { setLoadingCreds(false); }
  }, [company.id, hasAccount]);

  useEffect(() => { loadCredentials(); }, [loadCredentials]);

  const handleCreate = async () => {
    if (!email || !password) { toast.error("Заполните email и пароль"); return; }
    setCreating(true);
    try {
      const { data, error } = await safeInvoke<any>("create-company-user", { body: { company_id: company.id, email, password } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Аккаунт создан", { description: `Логин: ${email}` });
      setCredentials({ login_email: email, login_password: password });
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setCreating(false); }
  };

  const copyToClipboard = (text: string, label: string) => { navigator.clipboard.writeText(text); toast.success(`${label} скопирован`); };

  if (hasAccount || credentials) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><KeyRound className="w-5 h-5 text-primary" /></div>
          <div><h3 className="font-semibold">Доступ в кабинет компании</h3><p className="text-xs text-muted-foreground">Учётные данные для входа</p></div>
        </div>
        {loadingCreds ? (
          <div className="flex justify-center py-8"><Loader2Icon className="w-6 h-6 animate-spin text-primary" /></div>
        ) : credentials ? (
          <div className="space-y-3">
            {[
              { label: "Email:", value: credentials.login_email, copy: "Email" },
              { label: "Пароль:", value: showPassword ? credentials.login_password : "••••••••", copy: "Пароль", showToggle: true, rawValue: credentials.login_password },
              { label: "Ссылка:", value: `${getBaseUrl()}/login`, copy: "Ссылка" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border">
                <span className="text-sm text-muted-foreground w-16">{item.label}</span>
                <span className="text-sm font-mono flex-1 truncate">{item.value}</span>
                {item.showToggle && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(item.rawValue || item.value, item.copy)}><Copy className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        ) : <p className="text-muted-foreground text-sm">Не удалось загрузить учётные данные</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><KeyRound className="w-5 h-5 text-primary" /></div>
        <div><h3 className="font-semibold">Создать аккаунт компании</h3><p className="text-xs text-muted-foreground">Компания сможет входить в свой кабинет</p></div>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email для входа</label>
          <input type="email" className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="company@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Пароль</label>
          <input type="text" className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button className="w-full gap-2" onClick={handleCreate} disabled={creating || !email || !password}>
          {creating ? (<><Loader2Icon className="w-4 h-4 animate-spin" />Создание...</>) : (<><KeyRound className="w-4 h-4" />Создать аккаунт</>)}
        </Button>
      </div>
    </div>
  );
}

// ── Requests Tab ──

const REQUEST_TYPES: Record<string, string> = { training: "Обучение", documents: "Документы", consultation: "Консультация", other: "Другое" };
const STATUS_OPTIONS = [
  { value: "pending", label: "Ожидает" }, { value: "reviewed", label: "Рассмотрена" },
  { value: "approved", label: "Одобрена" }, { value: "rejected", label: "Отклонена" }, { value: "completed", label: "Выполнена" },
];
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { pending: "secondary", reviewed: "outline", approved: "default", rejected: "destructive", completed: "outline" };

function CompanyRequestsOrgView({ companyId }: { companyId: string }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { loadRequests(); }, [companyId]);

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase.from("company_requests").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data as any) || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const updateRequest = async (id: string, status: string, response: string) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase.from("company_requests").update({ status, org_response: response || null } as any).eq("id", id);
      if (error) throw error;
      toast.success("Заявка обновлена");
      loadRequests();
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setUpdatingId(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  if (requests.length === 0) return <div className="text-center py-12 text-muted-foreground"><Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Заявок от компании пока нет</p></div>;

  return (
    <div className="space-y-4">
      {requests.map((req) => <RequestCard key={req.id} request={req} isUpdating={updatingId === req.id} onUpdate={updateRequest} />)}
    </div>
  );
}

function RequestCard({ request, isUpdating, onUpdate }: { request: any; isUpdating: boolean; onUpdate: (id: string, status: string, response: string) => void }) {
  const [status, setStatus] = useState(request.status);
  const [response, setResponse] = useState(request.org_response || "");
  const employees = Array.isArray(request.employees) ? request.employees : [];

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-lg">{REQUEST_TYPES[request.request_type] || request.request_type}</Badge>
            <Badge variant={STATUS_VARIANT[request.status] || "secondary"} className="rounded-lg">{STATUS_OPTIONS.find((s) => s.value === request.status)?.label || request.status}</Badge>
          </div>
          <h4 className="font-semibold mt-2">{request.title}</h4>
          {request.description && <p className="text-sm text-muted-foreground mt-1">{request.description}</p>}
          {request.course_name && <p className="text-xs text-muted-foreground mt-1">Курс: {request.course_name}</p>}
          {request.desired_date && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="w-3 h-3" />Желаемая дата: {format(new Date(request.desired_date), "d MMMM yyyy", { locale: ru })}</p>}
          {employees.length > 0 && <p className="text-xs text-muted-foreground mt-1">Сотрудники: {employees.map((e: any) => e.full_name).join(", ")}</p>}
        </div>
        <span className="text-xs text-muted-foreground">{format(new Date(request.created_at), "d MMM yyyy", { locale: ru })}</span>
      </div>
      <div className="flex items-end gap-3 pt-2 border-t border-border">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Ответ организации</label>
          <Textarea className="rounded-xl resize-none text-sm" rows={2} placeholder="Ваш ответ на заявку..." value={response} onChange={(e) => setResponse(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Статус</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="rounded-xl w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" disabled={isUpdating || (status === request.status && response === (request.org_response || ""))} onClick={() => onUpdate(request.id, status, response)}>
          {isUpdating ? <SigmaSpinner size="xs" className=".5 .5" /> : <MessageSquare className="w-3.5 h-3.5" />}
          Ответить
        </Button>
      </div>
    </div>
  );
}
