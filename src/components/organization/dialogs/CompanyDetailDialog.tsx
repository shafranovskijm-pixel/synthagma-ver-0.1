import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Edit,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  UserPlus,
  Link2,
  BookOpen,
  FileText,
  Receipt,
  FileCheck,
  ChevronRight,
  Plus,
  Download,
  X,
  CheckCircle2,
  Clock,
  Banknote,
  Calendar,
  KeyRound,
  Copy,
  Loader2 as Loader2Icon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DocumentDropZone } from "../DocumentDropZone";
import type { Company, CompanyDocument } from "@/hooks/useCompaniesManager";

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
  onUploadDocument: (type: 'contract' | 'invoice' | 'act', file: File) => void;
  onViewDocument: (doc: CompanyDocument) => void;
  onDownloadDocument: (doc: CompanyDocument) => void;
  onDeleteDocument: (doc: CompanyDocument) => void;
  onTogglePaid: (doc: CompanyDocument) => void;
}

export function CompanyDetailDialog({
  open,
  onOpenChange,
  company,
  documents,
  isLoadingDocuments,
  isUploadingDocument,
  isDeletingDocument,
  onEdit,
  onDelete,
  onViewStudents,
  onBulkAssign,
  onOpenLinks,
  onBulkEnroll,
  onOpenContractGenerator,
  onOpenInvoiceGenerator,
  onOpenActGenerator,
  onUploadDocument,
  onViewDocument,
  onDownloadDocument,
  onDeleteDocument,
  onTogglePaid,
}: CompanyDetailDialogProps) {
  const getDocumentsByType = (type: 'contract' | 'invoice' | 'act') => {
    return documents.filter(doc => doc.type === type);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getDocumentStats = () => {
    const contracts = documents.filter(d => d.type === 'contract');
    const invoices = documents.filter(d => d.type === 'invoice');
    const acts = documents.filter(d => d.type === 'act');
    
    const paidInvoices = invoices.filter(d => d.is_paid);
    const unpaidInvoices = invoices.filter(d => !d.is_paid);
    
    const totalAmount = invoices.reduce((sum, d) => sum + (d.amount || 0), 0);
    const paidAmount = paidInvoices.reduce((sum, d) => sum + (d.amount || 0), 0);
    const unpaidAmount = unpaidInvoices.reduce((sum, d) => sum + (d.amount || 0), 0);
    
    return {
      contracts: contracts.length,
      invoices: invoices.length,
      acts: acts.length,
      paidInvoices: paidInvoices.length,
      unpaidInvoices: unpaidInvoices.length,
      totalAmount,
      paidAmount,
      unpaidAmount,
    };
  };

  const stats = getDocumentStats();

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl w-[95vw] max-w-6xl h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold">{company.name}</h2>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                  {company.inn && <span>ИНН: {company.inn}</span>}
                  {company.kpp && <span>КПП: {company.kpp}</span>}
                  {company.ogrn && <span>ОГРН: {company.ogrn}</span>}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(company.created_at).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                {company.director && (
                  <div className="text-sm text-muted-foreground mt-1">
                    <span className="text-foreground/70">Руководитель:</span> {company.director}
                  </div>
                )}
                {company.email && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="text-foreground/70">Email:</span> {company.email}
                  </div>
                )}
                {company.address && (
                  <div className="text-xs text-muted-foreground mt-1 max-w-xl truncate" title={company.address}>
                    <span className="text-foreground/70">Адрес:</span> {company.address}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(company);
                }}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl text-destructive hover:text-destructive"
                onClick={() => {
                  onOpenChange(false);
                  onDelete(company);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3 mt-5">
            <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <FileText className="w-3.5 h-3.5" />
                Договоры
              </div>
              <div className="text-xl font-bold">{stats.contracts}</div>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Receipt className="w-3.5 h-3.5" />
                Счета
              </div>
              <div className="text-xl font-bold">{stats.invoices}</div>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
              <div className="flex items-center gap-2 text-green-500 text-xs mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Оплачено
              </div>
              <div className="text-xl font-bold text-green-500">{stats.paidInvoices}</div>
              {stats.paidAmount > 0 && (
                <div className="text-xs text-muted-foreground">{new Intl.NumberFormat('ru-RU').format(stats.paidAmount)} ₽</div>
              )}
            </div>
            <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
              <div className="flex items-center gap-2 text-amber-500 text-xs mb-1">
                <Clock className="w-3.5 h-3.5" />
                Не оплачено
              </div>
              <div className="text-xl font-bold text-amber-500">{stats.unpaidInvoices}</div>
              {stats.unpaidAmount > 0 && (
                <div className="text-xs text-muted-foreground">{new Intl.NumberFormat('ru-RU').format(stats.unpaidAmount)} ₽</div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs Content */}
        <Tabs defaultValue="documents" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
            <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10">
              <FileText className="w-4 h-4 mr-2" />
              Документы
            </TabsTrigger>
            <TabsTrigger value="access" className="rounded-lg data-[state=active]:bg-primary/10">
              <KeyRound className="w-4 h-4 mr-2" />
              Доступ
            </TabsTrigger>
            <TabsTrigger value="actions" className="rounded-lg data-[state=active]:bg-primary/10">
              Действия
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Access Tab */}
            <TabsContent value="access" className="m-0">
              <CompanyAccessTab company={company} />
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="m-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                  onClick={() => {
                    onOpenChange(false);
                    onViewStudents(company);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Eye className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Просмотр учеников</div>
                    <div className="text-xs text-muted-foreground">Список и прогресс</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>

                <button
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                  onClick={() => {
                    onOpenChange(false);
                    onBulkAssign(company);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-sigma-green/10 flex items-center justify-center group-hover:bg-sigma-green/20 transition-colors">
                    <UserPlus className="w-5 h-5 text-sigma-green" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Назначить учеников</div>
                    <div className="text-xs text-muted-foreground">Добавить в компанию</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>

                <button
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenLinks(company);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Link2 className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Ссылки для регистрации</div>
                    <div className="text-xs text-muted-foreground">Управление ссылками</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>

                <button
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                  onClick={() => {
                    onOpenChange(false);
                    onBulkEnroll(company);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                    <GraduationCap className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Зачислить на курсы</div>
                    <div className="text-xs text-muted-foreground">Массовое зачисление</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="m-0">
              {isLoadingDocuments ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-6">
                  {/* Contracts */}
                  <DocumentSection
                    title="Договоры"
                    icon={<FileText className="w-5 h-5 text-orange-500" />}
                    iconBg="bg-orange-500/10"
                    documents={getDocumentsByType('contract')}
                    type="contract"
                    isUploading={isUploadingDocument === 'contract'}
                    isDeletingDocument={isDeletingDocument}
                    onCreateClick={() => onOpenContractGenerator(company)}
                    onUpload={(file) => onUploadDocument('contract', file)}
                    onView={onViewDocument}
                    onDownload={onDownloadDocument}
                    onDelete={onDeleteDocument}
                    formatDate={formatDate}
                  />

                  {/* Invoices */}
                  <DocumentSection
                    title="Счета"
                    icon={<Receipt className="w-5 h-5 text-blue-500" />}
                    iconBg="bg-blue-500/10"
                    documents={getDocumentsByType('invoice')}
                    type="invoice"
                    isUploading={isUploadingDocument === 'invoice'}
                    isDeletingDocument={isDeletingDocument}
                    onCreateClick={() => onOpenInvoiceGenerator(company)}
                    onUpload={(file) => onUploadDocument('invoice', file)}
                    onView={onViewDocument}
                    onDownload={onDownloadDocument}
                    onDelete={onDeleteDocument}
                    onTogglePaid={onTogglePaid}
                    formatDate={formatDate}
                  />

                  {/* Acts */}
                  <DocumentSection
                    title="Акты"
                    icon={<FileCheck className="w-5 h-5 text-sigma-green" />}
                    iconBg="bg-sigma-green/10"
                    documents={getDocumentsByType('act')}
                    type="act"
                    isUploading={isUploadingDocument === 'act'}
                    isDeletingDocument={isDeletingDocument}
                    onCreateClick={() => onOpenActGenerator(company)}
                    onUpload={(file) => onUploadDocument('act', file)}
                    onView={onViewDocument}
                    onDownload={onDownloadDocument}
                    onDelete={onDeleteDocument}
                    formatDate={formatDate}
                  />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface DocumentSectionProps {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  documents: CompanyDocument[];
  type: 'contract' | 'invoice' | 'act';
  isUploading: boolean;
  isDeletingDocument: string | null;
  onCreateClick: () => void;
  onUpload: (file: File) => void;
  onView: (doc: CompanyDocument) => void;
  onDownload: (doc: CompanyDocument) => void;
  onDelete: (doc: CompanyDocument) => void;
  onTogglePaid?: (doc: CompanyDocument) => void;
  formatDate: (dateString: string) => string;
}

function DocumentSection({
  title,
  icon,
  iconBg,
  documents,
  type,
  isUploading,
  isDeletingDocument,
  onCreateClick,
  onUpload,
  onView,
  onDownload,
  onDelete,
  onTogglePaid,
  formatDate,
}: DocumentSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
          {documents.length}
        </span>
      </div>
      
      <Button
        variant="outline"
        className="w-full rounded-xl gap-2 border-dashed"
        onClick={onCreateClick}
      >
        <Plus className="w-4 h-4" />
        Создать {title.toLowerCase().slice(0, -1)}
      </Button>
      
      <DocumentDropZone
        type={type}
        isUploading={isUploading}
        onUpload={onUpload}
      />

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {documents.map((doc) => (
          <DocumentItem
            key={doc.id}
            doc={doc}
            type={type}
            iconBg={iconBg}
            isDeletingDocument={isDeletingDocument}
            onView={onView}
            onDownload={onDownload}
            onDelete={onDelete}
            onTogglePaid={onTogglePaid}
            formatDate={formatDate}
          />
        ))}
      </div>
    </div>
  );
}

interface DocumentItemProps {
  doc: CompanyDocument;
  type: 'contract' | 'invoice' | 'act';
  iconBg: string;
  isDeletingDocument: string | null;
  onView: (doc: CompanyDocument) => void;
  onDownload: (doc: CompanyDocument) => void;
  onDelete: (doc: CompanyDocument) => void;
  onTogglePaid?: (doc: CompanyDocument) => void;
  formatDate: (dateString: string) => string;
}

function DocumentItem({
  doc,
  type,
  iconBg,
  isDeletingDocument,
  onView,
  onDownload,
  onDelete,
  onTogglePaid,
  formatDate,
}: DocumentItemProps) {
  const isInvoice = type === 'invoice';
  const isPaid = doc.is_paid;

  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
      isInvoice && isPaid ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-card hover:bg-secondary/30'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isInvoice && isPaid ? 'bg-green-500/10' : iconBg
      }`}>
        {isInvoice && isPaid ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : type === 'contract' ? (
          <FileText className="w-4 h-4 text-orange-500" />
        ) : type === 'invoice' ? (
          <Receipt className="w-4 h-4 text-blue-500" />
        ) : (
          <FileCheck className="w-4 h-4 text-sigma-green" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-xs truncate">{doc.name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {doc.amount && <span className="font-medium">{new Intl.NumberFormat('ru-RU').format(doc.amount)} ₽</span>}
          <span>• {formatDate(doc.uploaded_at)}</span>
          {isInvoice && isPaid && doc.paid_at && (
            <span className="text-green-600">• Оплачен {format(new Date(doc.paid_at), "dd.MM.yy", { locale: ru })}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        {isInvoice && onTogglePaid && (
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-lg h-7 w-7 ${isPaid ? 'text-green-500 hover:text-green-600' : 'text-muted-foreground hover:text-green-500'}`}
            onClick={() => onTogglePaid(doc)}
            title={isPaid ? "Отметить как неоплачено" : "Отметить как оплачено"}
          >
            {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg h-7 w-7 text-primary hover:text-primary"
          onClick={() => onView(doc)}
          title="Просмотреть"
        >
          <Eye className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg h-7 w-7"
          onClick={() => onDownload(doc)}
          title="Скачать"
        >
          <Download className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(doc)}
          disabled={isDeletingDocument === doc.id}
        >
          {isDeletingDocument === doc.id ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <X className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

function CompanyAccessTab({ company }: { company: Company }) {
  const { toast } = useToast();
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
      const { data } = await supabase.rpc('get_decrypted_company_credentials', {
        p_company_id: company.id,
      });
      if (data && data.length > 0) {
        setCredentials(data[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCreds(false);
    }
  }, [company.id, hasAccount]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleCreate = async () => {
    if (!email || !password) {
      toast({ title: "Заполните email и пароль", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-company-user", {
        body: { company_id: company.id, email, password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Аккаунт создан", description: `Логин: ${email}` });
      setCredentials({ login_email: email, login_password: password });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} скопирован` });
  };

  if (hasAccount || credentials) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Доступ в кабинет компании</h3>
            <p className="text-xs text-muted-foreground">Учётные данные для входа</p>
          </div>
        </div>

        {loadingCreds ? (
          <div className="flex justify-center py-8">
            <Loader2Icon className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : credentials ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border">
              <span className="text-sm text-muted-foreground w-16">Email:</span>
              <span className="text-sm font-mono flex-1">{credentials.login_email}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(credentials.login_email, "Email")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border">
              <span className="text-sm text-muted-foreground w-16">Пароль:</span>
              <span className="text-sm font-mono flex-1">
                {showPassword ? credentials.login_password : "••••••••"}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(credentials.login_password, "Пароль")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border">
              <span className="text-sm text-muted-foreground w-16">Ссылка:</span>
              <span className="text-sm font-mono flex-1 truncate">{window.location.origin}/login</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(`${window.location.origin}/login`, "Ссылка")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Не удалось загрузить учётные данные</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Создать аккаунт компании</h3>
          <p className="text-xs text-muted-foreground">Компания сможет входить в свой кабинет</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email для входа</label>
          <input
            type="email"
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="company@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Пароль</label>
          <input
            type="text"
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
            placeholder="Введите пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button className="w-full gap-2" onClick={handleCreate} disabled={creating || !email || !password}>
          {creating ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Создание...
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              Создать аккаунт
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
