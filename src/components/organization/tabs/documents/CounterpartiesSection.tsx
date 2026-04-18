import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollText, Receipt, FileCheck, Download, FileText, Lightbulb, Eye, Trash2, ExternalLink, Building2, User, Store, Plus, FolderOpen, ChevronDown, ChevronRight, X, Search, Send } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ContractLegalFaq } from "@/components/organization/ContractLegalFaq";
import { SendForSigningDialog, type SendForSigningPayload } from "@/components/signing/SendForSigningDialog";
import { ExternalContractUploader } from "@/components/signing/ExternalContractUploader";
import { ContractReviewBody } from "@/components/signing/ContractReviewBody";
import { File, Upload } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CounterpartySubTab, CounterpartyDoc, BillingDoc, InvoiceRow, CounterpartyOption } from "@/hooks/useDocumentsTab";

const docTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  invoice: { label: "Счёт", icon: <FileText className="w-4 h-4 text-blue-500" /> },
  receipt: { label: "Чек", icon: <Receipt className="w-4 h-4 text-emerald-500" /> },
  act: { label: "Акт", icon: <File className="w-4 h-4 text-amber-500" /> },
  other: { label: "Другое", icon: <File className="w-4 h-4 text-muted-foreground" /> },
};

interface ClientGroup {
  id: string;
  name: string;
  clients: CounterpartyOption[];
}

interface CounterpartiesSectionProps {
  organizationId: string;
  counterpartySubTab: CounterpartySubTab;
  setCounterpartySubTab: (v: CounterpartySubTab) => void;
  counterpartyDocs: CounterpartyDoc[];
  counterpartyLoading: boolean;
  onCreateContract: () => void;
  invoices: InvoiceRow[];
  billingDocs: BillingDoc[];
  onViewDoc: (doc: BillingDoc) => void;
  onDownloadDoc: (doc: BillingDoc) => void;
  onDeleteDoc: (doc: BillingDoc) => void;
  onShowInvoiceDialog: () => void;
  onShowActDialog: () => void;
}

export function CounterpartiesSection({
  organizationId,
  counterpartySubTab,
  setCounterpartySubTab,
  counterpartyDocs,
  counterpartyLoading,
  onCreateContract,
  invoices,
  billingDocs,
  onViewDoc,
  onDownloadDoc,
  onDeleteDoc,
  onShowInvoiceDialog,
  onShowActDialog,
}: CounterpartiesSectionProps) {
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("platform");
  const [showFaq, setShowFaq] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [visibleClientIds, setVisibleClientIds] = useState<Set<string>>(new Set());
  const [visiblePayerIds, setVisiblePayerIds] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [payerSearch, setPayerSearch] = useState("");
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [payerPopoverOpen, setPayerPopoverOpen] = useState(false);
  const [signingPayload, setSigningPayload] = useState<SendForSigningPayload | null>(null);
  const [signingRecipients, setSigningRecipients] = useState<{ id: string; name: string; email: string; type: "student" | "company" | "individual" }[]>([]);
  const [showExternalUploader, setShowExternalUploader] = useState(false);
  const [platformExternalContracts, setPlatformExternalContracts] = useState<any[]>([]);
  const [adminSigEmail, setAdminSigEmail] = useState<string>("support@sintagma.com.ru");
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [contractToDelete, setContractToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingContract, setDeletingContract] = useState(false);

  const handleDeleteContract = async () => {
    if (!contractToDelete) return;
    setDeletingContract(true);
    try {
      const { error } = await (supabase as any).rpc("hide_signature_for_viewer", { p_signature_id: contractToDelete.id });
      if (error) throw error;
      toast.success("Договор удалён из вашего списка");
      setContractToDelete(null);
      await refreshPlatformContracts();
    } catch (e: any) {
      toast.error(e?.message || "Не удалось удалить договор");
    } finally {
      setDeletingContract(false);
    }
  };

  // Handle deep-link from notification: open a specific signature
  useEffect(() => {
    const sigId = sessionStorage.getItem("openSignatureId");
    if (!sigId) return;
    sessionStorage.removeItem("openSignatureId");
    setSelectedId("platform");
    setCounterpartySubTab("contracts");
    // Wait for platformExternalContracts to load, then expand
    (async () => {
      const { data } = await (supabase as any)
        .from("document_signatures")
        .select("id, document_title, status, created_at, current_revision_id, sender_signed_at, requires_bilateral, signed_at, signature_token")
        .eq("organization_id", organizationId)
        .eq("document_type", "external_upload")
        .order("created_at", { ascending: false });
      setPlatformExternalContracts((data as any[]) || []);
      setExpandedReviewId(sigId);
      // Scroll into view next tick
      setTimeout(() => {
        const el = document.querySelector(`[data-signature-id="${sigId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    })();
  }, [organizationId, setCounterpartySubTab]);

  useEffect(() => {
    supabase.from("app_settings").select("setting_value").eq("setting_key", "admin_signature_email").maybeSingle()
      .then(({ data }) => {
        const v = data?.setting_value?.trim();
        setAdminSigEmail(v && v.length > 0 ? v : "support@sintagma.com.ru");
      });
  }, []);

  // Load external contracts (Synthagma counterparty) sent by current org
  const refreshPlatformContracts = async () => {
    const { data } = await (supabase as any)
      .from("document_signatures")
      .select("id, document_title, status, created_at, current_revision_id, sender_signed_at, requires_bilateral, signed_at, signature_token")
      .eq("organization_id", organizationId)
      .eq("document_type", "external_upload")
      .order("created_at", { ascending: false });
    setPlatformExternalContracts((data as any[]) || []);
  };
  useEffect(() => {
    if (selectedId === "platform") refreshPlatformContracts();
  }, [organizationId, selectedId]);

  const openSignDialog = async (doc: CounterpartyDoc) => {
    let html = "";
    if (doc.file_url) {
      try {
        const res = await fetch(doc.file_url);
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/html")) {
          html = await res.text();
        } else {
          html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.name}</title></head><body style="font-family:sans-serif;padding:32px"><h1>${doc.name}</h1><p>Документ доступен по ссылке:</p><p><a href="${doc.file_url}" target="_blank">${doc.file_url}</a></p></body></html>`;
        }
      } catch {
        html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.name}</title></head><body style="font-family:sans-serif;padding:32px"><h1>${doc.name}</h1><p>${doc.contract_number ? "№" + doc.contract_number : ""}</p></body></html>`;
      }
    } else {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.name}</title></head><body style="font-family:sans-serif;padding:32px"><h1>${doc.name}</h1><p>${doc.contract_number ? "№" + doc.contract_number : ""}${doc.contract_date ? " от " + new Date(doc.contract_date).toLocaleDateString("ru-RU") : ""}</p></body></html>`;
    }

    // Подгружаем получателей: компания (если выбрана) + ученики этой компании
    const recipients: { id: string; name: string; email: string; type: "student" | "company" | "individual" }[] = [];
    if (isCompany && selected) {
      const { data: comp } = await supabase.from("companies").select("user_id, login_email, name, email").eq("id", selected.id).maybeSingle();
      if (comp?.user_id && (comp.login_email || comp.email)) {
        recipients.push({ id: comp.user_id, name: comp.name, email: comp.login_email || comp.email!, type: "company" });
      }
    }
    setSigningRecipients(recipients);

    setSigningPayload({
      documentType: doc.type === "contract" ? "contract" : doc.type === "act" ? "act" : "custom_pdf",
      documentTitle: doc.name,
      documentHtml: html,
      documentId: doc.id,
      organizationId,
    });
  };

  // Load counterparties and groups
  useEffect(() => {
    const list: CounterpartyOption[] = [{ id: "platform", name: "Синтагма", type: "platform" }];

    supabase
      .from("companies")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name")
      .then(({ data }) => {
        const companies = (data || []).map(c => ({ id: c.id, name: c.name, type: "company" as const }));

        supabase
          .from("org_payers" as any)
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("name")
          .then(({ data: pData }) => {
            const payers = ((pData as any[]) || []).map((p: any) => ({ id: p.id, name: p.name, type: "payer" as const }));
            setCounterparties([...list, ...companies, ...payers]);
          });
      });

    // Load saved groups from localStorage
    const saved = localStorage.getItem(`client_groups_${organizationId}`);
    if (saved) {
      try { setClientGroups(JSON.parse(saved)); } catch {}
    }
    // Load saved visible clients/payers
    const savedClients = localStorage.getItem(`visible_clients_${organizationId}`);
    if (savedClients) try { setVisibleClientIds(new Set(JSON.parse(savedClients))); } catch {}
    const savedPayers = localStorage.getItem(`visible_payers_${organizationId}`);
    if (savedPayers) try { setVisiblePayerIds(new Set(JSON.parse(savedPayers))); } catch {}
  }, [organizationId]);

  const persistVisibleClients = (ids: Set<string>) => {
    setVisibleClientIds(ids);
    localStorage.setItem(`visible_clients_${organizationId}`, JSON.stringify([...ids]));
  };

  const persistVisiblePayers = (ids: Set<string>) => {
    setVisiblePayerIds(ids);
    localStorage.setItem(`visible_payers_${organizationId}`, JSON.stringify([...ids]));
  };

  const addVisibleClient = (id: string) => {
    const next = new Set(visibleClientIds);
    next.add(id);
    persistVisibleClients(next);
    setSelectedId(id);
    setClientPopoverOpen(false);
    setClientSearch("");
  };

  const removeVisibleClient = (id: string) => {
    const next = new Set(visibleClientIds);
    next.delete(id);
    persistVisibleClients(next);
    if (selectedId === id) setSelectedId("platform");
  };

  const addVisiblePayer = (id: string) => {
    const next = new Set(visiblePayerIds);
    next.add(id);
    persistVisiblePayers(next);
    setSelectedId(id);
    setPayerPopoverOpen(false);
    setPayerSearch("");
  };

  const removeVisiblePayer = (id: string) => {
    const next = new Set(visiblePayerIds);
    next.delete(id);
    persistVisiblePayers(next);
    if (selectedId === id) setSelectedId("platform");
  };
  // Persist groups
  const saveGroups = (groups: ClientGroup[]) => {
    setClientGroups(groups);
    localStorage.setItem(`client_groups_${organizationId}`, JSON.stringify(groups));
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const group: ClientGroup = { id: crypto.randomUUID(), name: newGroupName.trim(), clients: [] };
    saveGroups([...clientGroups, group]);
    setExpandedGroups(prev => ({ ...prev, [group.id]: true }));
    setNewGroupName("");
    setShowGroupDialog(false);
    toast.success(`Группа «${group.name}» создана`);
  };

  const handleDeleteGroup = (groupId: string) => {
    saveGroups(clientGroups.filter(g => g.id !== groupId));
    toast.success("Группа удалена");
  };

  const handleAddClientToGroup = (groupId: string, client: CounterpartyOption) => {
    saveGroups(clientGroups.map(g =>
      g.id === groupId && !g.clients.find(c => c.id === client.id)
        ? { ...g, clients: [...g.clients, client] }
        : g
    ));
  };

  const handleRemoveClientFromGroup = (groupId: string, clientId: string) => {
    saveGroups(clientGroups.map(g =>
      g.id === groupId
        ? { ...g, clients: g.clients.filter(c => c.id !== clientId) }
        : g
    ));
  };

  const selected = counterparties.find(c => c.id === selectedId) || counterparties[0];
  const isPlatform = selected?.type === "platform";
  const isCompany = selected?.type === "company";
  const isPayer = selected?.type === "payer";

  const companyDocs = isCompany ? counterpartyDocs.filter(d =>
    (d as any).company_id === selectedId || d.company_name === selected?.name
  ) : [];

  const platformItems = counterparties.filter(c => c.type === "platform");
  const companyItems = counterparties.filter(c => c.type === "company");
  const payerItems = counterparties.filter(c => c.type === "payer");

  // Find clients not in any group
  const groupedClientIds = new Set(clientGroups.flatMap(g => g.clients.map(c => c.id)));
  const ungroupedClients = companyItems.filter(c => !groupedClientIds.has(c.id));

  const toggleGroup = (id: string) =>
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));

  // --- Renderers (unchanged logic) ---

  const renderPlatformContracts = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-xl border border-dashed border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3">
          <Upload className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-medium">Загрузить свой договор на согласование</div>
            <div className="text-xs text-muted-foreground">PDF или DOCX — администратор Синтагмы внесёт правки и отправит на ПЭП</div>
          </div>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowExternalUploader(true)}>
          <Upload className="w-3.5 h-3.5" />Загрузить
        </Button>
      </div>

      {platformExternalContracts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Договоров с платформой пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {platformExternalContracts.map((c) => {
            const statusLabel: Record<string, { text: string; cls: string }> = {
              in_review: { text: "На согласовании", cls: "text-violet-600 bg-violet-500/10" },
              changes_requested: { text: "Запрошены правки", cls: "text-pink-600 bg-pink-500/10" },
              signed: { text: c.requires_bilateral && !c.sender_signed_at ? "Подписано получателем" : "Подписано", cls: "text-emerald-600 bg-emerald-500/10" },
              rejected: { text: "Отклонено", cls: "text-destructive bg-destructive/10" },
            };
            const st = statusLabel[c.status] || { text: c.status, cls: "text-muted-foreground bg-muted" };
            return (
              <div key={c.id} data-signature-id={c.id} className={cn("rounded-lg border transition-colors overflow-hidden", expandedReviewId === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30")}>
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ScrollText className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.document_title}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), "d MMM yyyy HH:mm", { locale: ru })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", st.cls)}>{st.text}</span>
                    {c.signature_token && (
                      <Button
                        variant={expandedReviewId === c.id ? "default" : "ghost"}
                        size="sm"
                        title={expandedReviewId === c.id ? "Свернуть" : "Открыть и просмотреть"}
                        onClick={() => setExpandedReviewId(prev => prev === c.id ? null : c.id)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {expandedReviewId === c.id && c.signature_token && (
                  <div className="border-t bg-background p-4">
                    <ContractReviewBody signatureToken={c.signature_token} viewerRole="organization" embedded />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPlatformInvoices = () => {
    if (invoices.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Счетов пока нет</p>
          <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onShowInvoiceDialog}>
            <Receipt className="w-3.5 h-3.5" />Сформировать счёт
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {invoices.map(inv => (
          <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <Receipt className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Счёт {inv.invoice_number}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽ · {inv.plan}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {inv.status === "paid" ? (
                <span className="text-xs font-medium text-emerald-600">Оплачен</span>
              ) : (
                <span className="text-xs font-medium text-amber-600">Не оплачен</span>
              )}
              <Button variant="ghost" size="sm" title="Скачать / Печать" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}>
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" title="Открыть" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPlatformClosing = () => {
    if (billingDocs.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Закрывающих документов пока нет</p>
          <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onShowActDialog}>
            <FileText className="w-3.5 h-3.5" />Сформировать акт
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {billingDocs.map(doc => {
          const docType = docTypeLabels[doc.doc_type] || docTypeLabels.other;
          return (
            <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                {docType.icon}
                <div>
                  <div className="text-sm font-medium">{doc.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {docType.label} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" title="Просмотр" onClick={() => onViewDoc(doc)}><Eye className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" title="Скачать" onClick={() => onDownloadDoc(doc)}><Download className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Удалить" onClick={() => onDeleteDoc(doc)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCompanyDocList = (type: string, emptyIcon: React.ReactNode, emptyText: string, showAmount = false) => {
    const docs = companyDocs.filter(d => d.type === type);
    if (counterpartyLoading) return <div className="text-center py-12 text-muted-foreground text-sm">Загрузка...</div>;
    if (docs.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          {emptyIcon}
          <p className="text-sm">{emptyText}</p>
          {type === "contract" && (
            <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onCreateContract}>
              <FileText className="w-3.5 h-3.5" />Создать договор
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              {type === "contract" ? <ScrollText className="w-4 h-4 text-primary" /> : type === "invoice" ? <Receipt className="w-4 h-4 text-primary" /> : <FileCheck className="w-4 h-4 text-primary" />}
              <div>
                <div className="text-sm font-medium">{doc.name}</div>
                <div className="text-xs text-muted-foreground">
                  {doc.contract_number || "—"} · {doc.contract_date ? new Date(doc.contract_date).toLocaleDateString("ru-RU") : new Date(doc.uploaded_at).toLocaleDateString("ru-RU")}
                  {showAmount && doc.amount ? ` · ${new Intl.NumberFormat("ru-RU").format(doc.amount)} ₽` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showAmount && (doc.is_paid ? <span className="text-xs font-medium text-emerald-600">Оплачен</span> : <span className="text-xs font-medium text-amber-600">Не оплачен</span>)}
              <Button variant="ghost" size="icon" title="Отправить на подписание" onClick={() => openSignDialog(doc)}>
                <Send className="w-4 h-4 text-indigo-500" />
              </Button>
              {doc.file_url && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /></a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPayerContent = () => (
    <div className="text-center py-12 text-muted-foreground">
      <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm font-medium">Документы плательщика</p>
      <p className="text-xs mt-1">Здесь будут отображаться документы по взаиморасчётам</p>
    </div>
  );

  const getIcon = (type: CounterpartyOption["type"]) => {
    if (type === "platform") return <Store className="w-3.5 h-3.5" />;
    if (type === "company") return <Building2 className="w-3.5 h-3.5" />;
    return <User className="w-3.5 h-3.5" />;
  };

  const renderChip = (cp: CounterpartyOption) => (
    <button
      key={cp.id}
      onClick={() => setSelectedId(cp.id)}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
        selectedId === cp.id
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      )}
    >
      {getIcon(cp.type)}
      {cp.name}
    </button>
  );

  const visibleClients = companyItems.filter(c => visibleClientIds.has(c.id));
  const visiblePayers = payerItems.filter(p => visiblePayerIds.has(p.id));
  const searchableClients = companyItems.filter(c => !visibleClientIds.has(c.id) && c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  const searchablePayers = payerItems.filter(p => !visiblePayerIds.has(p.id) && p.name.toLowerCase().includes(payerSearch.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {/* Platform */}
          {platformItems.map(renderChip)}

          {/* Divider + Clients section */}
          <div className="h-5 w-px bg-border mx-1" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mr-0.5">Компании</span>

          {/* Client groups (collapsed by default) */}
          {clientGroups.map(group => (
            <div key={group.id} className="flex items-center">
              <button
                onClick={() => toggleGroup(group.id)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-md bg-muted/30 hover:bg-muted transition-colors"
              >
                <FolderOpen className="w-3 h-3" />
                {group.name}
                {expandedGroups[group.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span className="text-[9px] opacity-60">({group.clients.length})</span>
              </button>
            </div>
          ))}

          {/* Visible (selected) client chips */}
          {visibleClients.map(cp => (
            <div key={cp.id} className="inline-flex items-center">
              {renderChip(cp)}
              <button
                onClick={() => removeVisibleClient(cp.id)}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Скрыть"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add client popover */}
          <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="w-6 h-6 flex items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Добавить компанию"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2" align="start">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Поиск компании..."
                  className="h-8 pl-7 text-xs rounded-lg"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {searchableClients.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {companyItems.length === 0 ? "Нет компаний" : "Все добавлены"}
                  </p>
                ) : searchableClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => addVisibleClient(c.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted rounded-md transition-colors text-left"
                  >
                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Divider + Payers */}
          <div className="h-5 w-px bg-border mx-1" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mr-0.5">Ученики</span>

          {/* Visible payer chips */}
          {visiblePayers.map(cp => (
            <div key={cp.id} className="inline-flex items-center">
              {renderChip(cp)}
              <button
                onClick={() => removeVisiblePayer(cp.id)}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Скрыть"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add payer popover */}
          <Popover open={payerPopoverOpen} onOpenChange={setPayerPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="w-6 h-6 flex items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Добавить ученика"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2" align="start">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={payerSearch}
                  onChange={e => setPayerSearch(e.target.value)}
                  placeholder="Поиск ученика..."
                  className="h-8 pl-7 text-xs rounded-lg"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {searchablePayers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {payerItems.length === 0 ? "Нет учеников" : "Все добавлены"}
                  </p>
                ) : searchablePayers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addVisiblePayer(p.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted rounded-md transition-colors text-left"
                  >
                    <User className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {companyItems.length > 0 && (
            <button
              onClick={() => setShowGroupDialog(true)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Создать группу клиентов"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Pulsing FAQ button */}
          <button
            onClick={() => setShowFaq(true)}
            className="relative shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Справка по договорам (273-ФЗ)"
          >
            <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
            <Lightbulb className="w-3.5 h-3.5 relative z-10" />
          </button>
        </div>
      </div>

      {/* Expanded group chips */}
      {clientGroups.filter(g => expandedGroups[g.id]).map(group => (
        <div key={group.id} className="ml-4 flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-muted/20 border border-border/50">
          <span className="text-[10px] text-muted-foreground font-medium mr-1">{group.name}:</span>
          {group.clients.map(client => (
            <div key={client.id} className="inline-flex items-center">
              {renderChip(client)}
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveClientFromGroup(group.id, client.id); }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Убрать из группы"
              >
                ×
              </button>
            </div>
          ))}
          {/* Add client to group dropdown */}
          {ungroupedClients.length > 0 && (
            <div className="relative group/add">
              <button className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                <Plus className="w-3 h-3" /> Добавить
              </button>
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 hidden group-hover/add:block z-20 min-w-[160px]">
                {ungroupedClients.map(client => (
                  <button
                    key={client.id}
                    onClick={() => handleAddClientToGroup(group.id, client)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted rounded-md transition-colors text-left"
                  >
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    {client.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => handleDeleteGroup(group.id)}
            className="ml-auto text-[10px] text-destructive/60 hover:text-destructive transition-colors"
          >
            Удалить группу
          </button>
        </div>
      ))}

      {/* FAQ Dialog */}
      <Dialog open={showFaq} onOpenChange={setShowFaq}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              Справка по договорам (273-ФЗ)
            </DialogTitle>
          </DialogHeader>
          <ContractLegalFaq />
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Создать группу клиентов</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Название группы</Label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Например: Школы, Строительство…"
                className="rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
              />
            </div>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()} className="w-full rounded-xl">
              <FolderOpen className="w-4 h-4 mr-1.5" /> Создать группу
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-tabs */}
      <Tabs value={counterpartySubTab} onValueChange={(v) => setCounterpartySubTab(v as CounterpartySubTab)}>
        <TabsList className="bg-muted/50 rounded-xl mb-4">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5"><ScrollText className="w-3.5 h-3.5" />Договоры</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5"><Receipt className="w-3.5 h-3.5" />Счета</TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5"><FileCheck className="w-3.5 h-3.5" />Закрывающие</TabsTrigger>
        </TabsList>

        {isPlatform && (
          <>
            <TabsContent value="contracts" className="mt-0">{renderPlatformContracts()}</TabsContent>
            <TabsContent value="invoices" className="mt-0">{renderPlatformInvoices()}</TabsContent>
            <TabsContent value="closing" className="mt-0">{renderPlatformClosing()}</TabsContent>
          </>
        )}

        {isCompany && (
          <>
            <TabsContent value="contracts" className="mt-0">
              {renderCompanyDocList("contract", <><ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-medium">Договоры</p></>, "Договоров пока нет")}
            </TabsContent>
            <TabsContent value="invoices" className="mt-0">
              {renderCompanyDocList("invoice", <><Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" /></>, "Счетов пока нет", true)}
            </TabsContent>
            <TabsContent value="closing" className="mt-0">
              {renderCompanyDocList("act", <><FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" /></>, "Актов пока нет")}
            </TabsContent>
          </>
        )}

        {isPayer && (
          <>
            <TabsContent value="contracts" className="mt-0">{renderPayerContent()}</TabsContent>
            <TabsContent value="invoices" className="mt-0">{renderPayerContent()}</TabsContent>
            <TabsContent value="closing" className="mt-0">{renderPayerContent()}</TabsContent>
          </>
        )}
      </Tabs>

      <SendForSigningDialog
        open={!!signingPayload}
        onOpenChange={(v) => !v && setSigningPayload(null)}
        payload={signingPayload}
        recipients={signingRecipients}
      />

      <ExternalContractUploader
        open={showExternalUploader}
        onOpenChange={setShowExternalUploader}
        organizationId={organizationId}
        defaultAdminEmail={adminSigEmail}
        onSent={() => { refreshPlatformContracts(); }}
      />

    </div>
  );
}
