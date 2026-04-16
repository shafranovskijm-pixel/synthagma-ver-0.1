import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  FileText, Receipt, Search, Eye, ExternalLink, ScrollText, Plus, FolderOpen,
  FileCheck, Download, Trash2, CheckCircle2, Calendar
} from "lucide-react";
import { useAdminBilling, type Invoice, type BillingDoc, type Contract } from "@/hooks/useAdminBilling";

const NAV_SECTIONS = [
  { value: "all" as const, label: "Все расчёты", icon: FolderOpen, group: "overview" },
  { value: "org-contracts" as const, label: "Договоры", icon: ScrollText, group: "org" },
  { value: "org-invoices" as const, label: "Счета", icon: Receipt, group: "org" },
  { value: "org-closing" as const, label: "Закрывающие", icon: FileCheck, group: "org" },
];

const SECTION_DESCRIPTIONS: Record<string, string> = {
  all: "Договоры, счета и закрывающие документы по всем организациям",
  "org-contracts": "Договоры выбранной организации",
  "org-invoices": "Счета выбранной организации",
  "org-closing": "Акты и закрывающие документы выбранной организации",
};

export const AdminBillingOverview = () => {
  const h = useAdminBilling();
  const activeNavItem = NAV_SECTIONS.find(n => n.value === h.activeSection) || NAV_SECTIONS[0];

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Оплачен</Badge>;
    if (status === "pending") return <Badge variant="secondary">Ожидает</Badge>;
    if (status === "active") return <Badge variant="default" className="bg-blue-500/10 text-blue-600 border-blue-200">Активен</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  if (h.loading) return <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>;

  return (
    <div className="space-y-0">
      <div className="flex flex-col lg:flex-row gap-0 min-h-[600px]">
        {/* Left sidebar navigation */}
        <nav className="lg:w-56 xl:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card lg:rounded-l-2xl">
          <div className="lg:hidden flex overflow-x-auto gap-1 p-2">
            {NAV_SECTIONS.map(item => {
              const Icon = item.icon;
              const isActive = h.activeSection === item.value;
              const disabled = item.group === "org" && !h.selectedOrgId;
              return <button key={item.value} onClick={() => !disabled && h.setActiveSection(item.value)} disabled={disabled} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50", disabled && "opacity-40 cursor-not-allowed")}><Icon className="w-3.5 h-3.5" />{item.label}</button>;
            })}
          </div>
          <div className="hidden lg:flex flex-col py-3 bg-gradient-to-b from-card to-muted/20">
            <div className="px-4 pb-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Обзор</span></div>
            <button onClick={() => h.setActiveSection("all")} className={cn("flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 group", h.activeSection === "all" ? "bg-primary/15 text-primary border-r-2 border-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/10 hover:translate-x-0.5")}>
              <FolderOpen className={cn("w-4 h-4 shrink-0 transition-colors duration-200", h.activeSection === "all" ? "text-primary" : "group-hover:text-primary")} />Все расчёты
            </button>
            <div className="px-4 pt-3 pb-1"><div className="h-px bg-border/60" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mt-2 block">Организация</span></div>
            <div className="px-3 pb-2">
              <Select value={h.selectedOrgId} onValueChange={v => { h.setSelectedOrgId(v); h.setActiveSection("org-contracts"); }}>
                <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Выберите..." /></SelectTrigger>
                <SelectContent className="max-h-60">{h.orgs.map(o => <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {NAV_SECTIONS.filter(n => n.group === "org").map(item => {
              const Icon = item.icon;
              const isActive = h.activeSection === item.value;
              const disabled = !h.selectedOrgId;
              const count = item.value === "org-contracts" ? h.orgContracts.length : item.value === "org-invoices" ? h.orgInvoices.length : h.orgClosingDocs.length;
              return <button key={item.value} onClick={() => !disabled && h.setActiveSection(item.value)} disabled={disabled} className={cn("flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 group", isActive ? "bg-primary/15 text-primary border-r-2 border-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/10 hover:translate-x-0.5", disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground hover:translate-x-0")}>
                <Icon className={cn("w-4 h-4 shrink-0 transition-colors duration-200", isActive ? "text-primary" : "group-hover:text-primary")} />{item.label}{h.selectedOrgId && <span className="ml-auto text-xs text-muted-foreground">{count}</span>}
              </button>;
            })}
          </div>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 bg-card lg:rounded-r-2xl border-l-0">
          <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2"><activeNavItem.icon className="w-4 h-4 text-primary" />{activeNavItem.label}{h.selectedOrgId && h.activeSection !== "all" && h.selectedOrg && <span className="text-xs font-normal text-muted-foreground ml-1">— {h.selectedOrg.name}</span>}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{SECTION_DESCRIPTIONS[h.activeSection]}</p>
            </div>
            <div className="flex items-center gap-2">
              {h.activeSection === "org-contracts" && h.selectedOrgId && <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => { h.setContractForm(f => ({ ...f, organization_id: h.selectedOrgId })); h.setShowCreateContract(true); }}><Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline">Создать договор</span></Button>}
              {h.activeSection === "org-invoices" && h.selectedOrgId && <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => h.setShowInvoiceDialog(true)}><Receipt className="w-3.5 h-3.5" /><span className="hidden sm:inline">Сформировать счёт</span></Button>}
              {h.activeSection === "org-closing" && h.selectedOrgId && <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => h.setShowActDialog(true)}><FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">Сформировать акт</span></Button>}
            </div>
          </div>
          <div className="p-4 lg:p-6">
            {h.activeSection === "all" && <AllBillingContent h={h} statusBadge={statusBadge} />}
            {h.activeSection === "org-contracts" && (h.selectedOrgId ? <OrgContractsList contracts={h.orgContracts} statusBadge={statusBadge} /> : <EmptyOrgPrompt />)}
            {h.activeSection === "org-invoices" && (h.selectedOrgId ? <OrgInvoicesList invoices={h.orgInvoices} statusBadge={statusBadge} onMarkPaid={h.handleMarkPaid} selectedInvoiceIds={h.selectedInvoiceIds} toggleInvoiceSelection={h.toggleInvoiceSelection} onDeleteSelected={() => h.setShowDeleteConfirm(true)} /> : <EmptyOrgPrompt />)}
            {h.activeSection === "org-closing" && (h.selectedOrgId ? <OrgClosingList docs={h.orgClosingDocs} handleViewDoc={h.handleViewDoc} handleDeleteDoc={h.handleDeleteDoc} /> : <EmptyOrgPrompt />)}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <CreateContractDialog h={h} />
      <InvoiceDialog h={h} />
      <ActDialog h={h} />
      <PendingActDialog h={h} />
      <PendingInvoiceDialog h={h} />
      <DeleteInvoicesDialog h={h} />
    </div>
  );
};

// ---- Sub-components ----
function EmptyOrgPrompt() { return <div className="text-center py-12 text-muted-foreground text-sm">Выберите организацию в боковом меню</div>; }
function EmptyState({ text }: { text: string }) { return <div className="text-center py-8 text-muted-foreground text-sm">{text}</div>; }

function AllBillingContent({ h, statusBadge }: any) {
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск по номеру или организации..." value={h.search} onChange={(e: any) => h.setSearch(e.target.value)} className="pl-9 rounded-xl" /></div>
      <Tabs defaultValue="contracts">
        <TabsList className="bg-muted/50 rounded-xl">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5"><ScrollText className="w-3.5 h-3.5" />Договоры ({h.filteredContracts.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5"><Receipt className="w-3.5 h-3.5" />Счета ({h.filteredInvoices.length})</TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5"><FileText className="w-3.5 h-3.5" />Закрывающие ({h.filteredDocs.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts" className="mt-4">
          <div className="flex justify-end mb-3"><Button size="sm" className="rounded-xl gap-1.5" onClick={() => h.setShowCreateContract(true)}><Plus className="w-3.5 h-3.5" />Создать договор</Button></div>
          {h.filteredContracts.length === 0 ? <EmptyState text="Договоров не найдено" /> : <div className="space-y-2">{h.filteredContracts.map((c: Contract) => <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"><div className="flex items-center gap-3"><ScrollText className="w-4 h-4 text-primary" /><div><div className="text-sm font-medium">{c.contract_number ? `Договор №${c.contract_number}` : "Договор (без номера)"}</div><div className="text-xs text-muted-foreground">{c.org_name} {c.contract_date && `· ${format(new Date(c.contract_date), "d MMM yyyy", { locale: ru })}`}</div></div></div>{statusBadge(c.status)}</div>)}</div>}
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          {h.selectedInvoiceIds.size > 0 && <div className="flex items-center gap-2 mb-3"><span className="text-sm text-muted-foreground">Выбрано: {h.selectedInvoiceIds.size}</span><Button variant="destructive" size="sm" className="rounded-xl gap-1.5" onClick={() => h.setShowDeleteConfirm(true)}><Trash2 className="w-3.5 h-3.5" />Удалить</Button><Button variant="ghost" size="sm" onClick={() => h.toggleInvoiceSelection('__clear__')}>Снять выделение</Button></div>}
          {h.filteredInvoices.length === 0 ? <EmptyState text="Счетов не найдено" /> : <div className="space-y-2">{h.filteredInvoices.map((inv: Invoice) => <div key={inv.id} className={cn("flex items-center justify-between p-3 rounded-lg border transition-colors", h.selectedInvoiceIds.has(inv.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30")}><div className="flex items-center gap-3"><Checkbox checked={h.selectedInvoiceIds.has(inv.id)} onCheckedChange={() => h.toggleInvoiceSelection(inv.id)} /><Receipt className="w-4 h-4 text-blue-500" /><div><div className="text-sm font-medium">Счёт {inv.invoice_number}</div><div className="text-xs text-muted-foreground">{inv.org_name} · {format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽</div></div></div><div className="flex items-center gap-2">{inv.status === "pending" && <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => h.handleMarkPaid(inv)}><CheckCircle2 className="w-4 h-4" /></Button>}{statusBadge(inv.status)}<Button variant="ghost" size="sm" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}><ExternalLink className="w-4 h-4" /></Button></div></div>)}</div>}
        </TabsContent>
        <TabsContent value="closing" className="mt-4">
          {h.filteredDocs.length === 0 ? <EmptyState text="Документов не найдено" /> : <div className="space-y-2">{h.filteredDocs.map((doc: BillingDoc) => <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"><div className="flex items-center gap-3"><FileText className="w-4 h-4 text-amber-500" /><div><div className="text-sm font-medium">{doc.name}</div><div className="text-xs text-muted-foreground">{doc.org_name} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}</div></div></div><Button variant="ghost" size="sm" onClick={() => h.handleViewDoc(doc)}><Eye className="w-4 h-4" /></Button></div>)}</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgContractsList({ contracts, statusBadge }: { contracts: Contract[]; statusBadge: (s: string) => React.ReactNode }) {
  if (contracts.length === 0) return <EmptyState text="Нет договоров" />;
  return <div className="space-y-2">{contracts.map(c => <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"><div className="flex items-center gap-3"><ScrollText className="w-4 h-4 text-primary" /><div><div className="text-sm font-medium">{c.contract_number ? `Договор №${c.contract_number}` : "Договор (без номера)"}</div><div className="text-xs text-muted-foreground">{c.contract_date && format(new Date(c.contract_date), "d MMM yyyy", { locale: ru })}</div></div></div>{statusBadge(c.status)}</div>)}</div>;
}

function OrgInvoicesList({ invoices, statusBadge, onMarkPaid, selectedInvoiceIds, toggleInvoiceSelection, onDeleteSelected }: any) {
  if (invoices.length === 0) return <EmptyState text="Нет счетов" />;
  return (
    <div className="space-y-2">
      {selectedInvoiceIds.size > 0 && <div className="flex items-center gap-2 mb-1"><span className="text-sm text-muted-foreground">Выбрано: {selectedInvoiceIds.size}</span><Button variant="destructive" size="sm" className="rounded-xl gap-1.5" onClick={onDeleteSelected}><Trash2 className="w-3.5 h-3.5" />Удалить</Button></div>}
      {invoices.map((inv: Invoice) => <div key={inv.id} className={cn("flex items-center justify-between p-3 rounded-lg border transition-colors", selectedInvoiceIds.has(inv.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30")}><div className="flex items-center gap-3"><Checkbox checked={selectedInvoiceIds.has(inv.id)} onCheckedChange={() => toggleInvoiceSelection(inv.id)} /><Receipt className="w-4 h-4 text-blue-500" /><div><div className="text-sm font-medium">Счёт {inv.invoice_number}</div><div className="text-xs text-muted-foreground">{format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽</div></div></div><div className="flex items-center gap-2">{inv.status === "pending" && onMarkPaid && <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => onMarkPaid(inv)}><CheckCircle2 className="w-4 h-4" /></Button>}{statusBadge(inv.status)}<Button variant="ghost" size="sm" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}><ExternalLink className="w-4 h-4" /></Button></div></div>)}
    </div>
  );
}

function OrgClosingList({ docs, handleViewDoc, handleDeleteDoc }: any) {
  if (docs.length === 0) return <EmptyState text="Нет закрывающих документов" />;
  return <div className="space-y-2">{docs.map((doc: BillingDoc) => <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"><div className="flex items-center gap-3"><FileText className="w-4 h-4 text-amber-500" /><div><div className="text-sm font-medium">{doc.name}</div><div className="text-xs text-muted-foreground">{format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}</div></div></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => handleViewDoc(doc)}><Eye className="w-4 h-4" /></Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteDoc(doc)}><Trash2 className="w-4 h-4" /></Button></div></div>)}</div>;
}

// ---- Dialogs ----
function CreateContractDialog({ h }: any) {
  return (
    <Dialog open={h.showCreateContract} onOpenChange={h.setShowCreateContract}>
      <DialogContent>
        <DialogHeader><DialogTitle>Создать договор</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {h.activeSection === "all" && <div className="space-y-2"><Label>Организация *</Label><Select value={h.contractForm.organization_id} onValueChange={(v: string) => h.setContractForm((f: any) => ({ ...f, organization_id: v }))}><SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger><SelectContent>{h.orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="space-y-2"><Label>Номер договора</Label><Input value={h.contractForm.contract_number} onChange={(e: any) => h.setContractForm((f: any) => ({ ...f, contract_number: e.target.value }))} placeholder="№..." /></div>
          <div className="space-y-2"><Label>Дата договора</Label><Input type="date" value={h.contractForm.contract_date} onChange={(e: any) => h.setContractForm((f: any) => ({ ...f, contract_date: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => h.setShowCreateContract(false)}>Отмена</Button><Button onClick={h.handleCreateContract} disabled={h.submitting || (h.activeSection === "all" && !h.contractForm.organization_id)}>{h.submitting ? "Создание..." : "Создать"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ h }: any) {
  return (
    <Dialog open={h.showInvoiceDialog} onOpenChange={h.setShowInvoiceDialog}>
      <DialogContent>
        <DialogHeader><DialogTitle>Сформировать счёт</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {h.selectedOrg && <div className="p-3 rounded-lg bg-muted/50 text-sm"><div className="font-medium">{h.selectedOrg.name}</div><div className="text-xs text-muted-foreground mt-1">Тариф: {h.selectedOrg.subscription_plan || "start"} · Сумма: {(() => { const P: Record<string, number> = { free: 0, start: 1990, standard: 4990, professional: 9990, maximum: 19990 }; return Math.max(0, (h.selectedOrg.custom_price ?? P[h.selectedOrg.subscription_plan || "start"] ?? 1990) - (h.selectedOrg.custom_discount ?? 0)).toLocaleString("ru-RU"); })()} ₽</div></div>}
          <div className="flex items-center gap-2"><Checkbox id="otherPayer" checked={h.invoiceOtherPayer} onCheckedChange={(v: any) => h.setInvoiceOtherPayer(!!v)} /><Label htmlFor="otherPayer" className="text-sm">Другой плательщик</Label></div>
          {h.invoiceOtherPayer && <div className="space-y-3 p-3 rounded-lg border">
            <div className="space-y-1"><Label className="text-xs">ИНН</Label><div className="flex gap-2"><Input value={h.invoiceBuyerInn} onChange={(e: any) => h.setInvoiceBuyerInn(e.target.value)} placeholder="ИНН" className="text-sm" /><Button size="sm" variant="outline" onClick={() => h.handleSearchByInn(h.invoiceBuyerInn)} disabled={h.innSearching}>{h.innSearching ? "..." : <Search className="w-3.5 h-3.5" />}</Button></div></div>
            <div className="space-y-1"><Label className="text-xs">Название</Label><Input value={h.invoiceBuyerName} onChange={(e: any) => h.setInvoiceBuyerName(e.target.value)} className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">КПП</Label><Input value={h.invoiceBuyerKpp} onChange={(e: any) => h.setInvoiceBuyerKpp(e.target.value)} className="text-sm" /></div>
          </div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => h.setShowInvoiceDialog(false)}>Отмена</Button><Button onClick={h.handleGenerateInvoice} disabled={h.generatingInvoice}>{h.generatingInvoice ? "Формирование..." : "Сформировать"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActDialog({ h }: any) {
  return (
    <Dialog open={h.showActDialog} onOpenChange={h.setShowActDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Сформировать акт</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>Дата акта</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left text-sm"><Calendar className="w-4 h-4 mr-2" />{format(h.actDate, "d MMMM yyyy", { locale: ru })}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><CalendarComponent mode="single" selected={h.actDate} onSelect={(d: any) => d && h.setActDate(d)} /></PopoverContent></Popover></div>
          <div className="space-y-1"><Label>Основание (предмет)</Label><Input value={h.actBasis} onChange={(e: any) => h.setActBasis(e.target.value)} placeholder="Оказание образовательных услуг..." /></div>
          <div className="space-y-1"><Label>Сумма (₽)</Label><Input type="number" value={h.actAmount} onChange={(e: any) => h.setActAmount(e.target.value)} placeholder="0" /></div>
          <div className="flex items-center gap-2"><Checkbox id="actOther" checked={h.actOtherCustomer} onCheckedChange={(v: any) => h.setActOtherCustomer(!!v)} /><Label htmlFor="actOther" className="text-sm">Другой заказчик</Label></div>
          {h.actOtherCustomer && <div className="space-y-3 p-3 rounded-lg border">
            <div className="space-y-1"><Label className="text-xs">ИНН</Label><div className="flex gap-2"><Input value={h.actCustomerInn} onChange={(e: any) => h.setActCustomerInn(e.target.value)} placeholder="ИНН" className="text-sm" /><Button size="sm" variant="outline" onClick={() => h.handleActSearchByInn(h.actCustomerInn)} disabled={h.actInnSearching}>{h.actInnSearching ? "..." : <Search className="w-3.5 h-3.5" />}</Button></div></div>
            <div className="space-y-1"><Label className="text-xs">Название</Label><Input value={h.actCustomerName} onChange={(e: any) => h.setActCustomerName(e.target.value)} className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">КПП</Label><Input value={h.actCustomerKpp} onChange={(e: any) => h.setActCustomerKpp(e.target.value)} className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Руководитель</Label><Input value={h.actCustomerDirector} onChange={(e: any) => h.setActCustomerDirector(e.target.value)} className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Должность</Label><Input value={h.actCustomerPosition} onChange={(e: any) => h.setActCustomerPosition(e.target.value)} className="text-sm" /></div>
          </div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => h.setShowActDialog(false)}>Отмена</Button><Button onClick={h.handleGenerateAct} disabled={h.actSubmitting || !h.actBasis || !h.actAmount}>{h.actSubmitting ? "Создание..." : "Сформировать"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingActDialog({ h }: any) {
  return (
    <Dialog open={!!h.pendingAct} onOpenChange={() => h.setPendingAct(null)}>
      <DialogContent><DialogHeader><DialogTitle>Акт сформирован</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Акт «{h.pendingAct?.docName}» готов. Выберите действие для сохранения:</p>
        <DialogFooter className="flex-col sm:flex-row gap-2"><Button variant="outline" onClick={() => h.setPendingAct(null)}>Закрыть без сохранения</Button><Button variant="outline" className="gap-1.5" onClick={() => h.handleSavePendingAct('print')}><Eye className="w-4 h-4" />Печать</Button><Button className="gap-1.5" onClick={() => h.handleSavePendingAct('download')}><Download className="w-4 h-4" />Скачать</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvoiceDialog({ h }: any) {
  return (
    <Dialog open={!!h.pendingInvoice} onOpenChange={() => h.setPendingInvoice(null)}>
      <DialogContent><DialogHeader><DialogTitle>Счёт сформирован</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Счёт «{h.pendingInvoice?.invoiceNum}» на {h.pendingInvoice?.amount?.toLocaleString("ru-RU")} ₽ готов. Выберите действие для сохранения:</p>
        <DialogFooter className="flex-col sm:flex-row gap-2"><Button variant="outline" onClick={() => h.setPendingInvoice(null)}>Закрыть без сохранения</Button><Button variant="outline" className="gap-1.5" onClick={() => h.handleSavePendingInvoice('print')}><Eye className="w-4 h-4" />Печать</Button><Button className="gap-1.5" onClick={() => h.handleSavePendingInvoice('download')}><Download className="w-4 h-4" />Скачать</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteInvoicesDialog({ h }: any) {
  return (
    <Dialog open={h.showDeleteConfirm} onOpenChange={h.setShowDeleteConfirm}>
      <DialogContent><DialogHeader><DialogTitle>Удалить счета?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Вы уверены, что хотите удалить выбранные счета ({h.selectedInvoiceIds.size} шт.)? Это действие необратимо.</p>
        <DialogFooter><Button variant="outline" onClick={() => h.setShowDeleteConfirm(false)}>Отмена</Button><Button variant="destructive" onClick={h.handleDeleteSelectedInvoices} disabled={h.deleting}>{h.deleting ? "Удаление..." : `Удалить (${h.selectedInvoiceIds.size})`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
