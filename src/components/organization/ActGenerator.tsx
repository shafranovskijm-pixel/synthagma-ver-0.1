import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Download, Printer, Save, Receipt, ArrowRight, Eye } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useActGenerator } from "@/hooks/useActGenerator";
import type { OrgRequisites, DocumentCompany } from "@/utils/documentHelpers";

interface ActGeneratorProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  orgRequisites: OrgRequisites;
  preselectedCompany?: DocumentCompany | null;
  onSave?: (html: string, actNumber: string, companyName: string, amount: number) => Promise<void>;
}

export function ActGenerator({ organizationId, isOpen, onClose, orgRequisites, preselectedCompany, onSave }: ActGeneratorProps) {
  const h = useActGenerator(organizationId, isOpen, orgRequisites, preselectedCompany);

  const renderModeSelection = () => (
    <div className="space-y-4 py-4">
      <p className="text-center text-muted-foreground">Как вы хотите создать акт?</p>
      <div className="grid gap-3">
        <Button variant="outline" className="h-auto py-4 px-4 justify-start gap-4" onClick={() => h.setMode('invoice')}>
          <Receipt className="w-8 h-8 text-primary" />
          <div className="text-left"><p className="font-medium">На основании счёта</p><p className="text-sm text-muted-foreground">Данные будут загружены из выбранного счёта</p></div>
          <ArrowRight className="w-5 h-5 ml-auto text-muted-foreground" />
        </Button>
        <Button variant="outline" className="h-auto py-4 px-4 justify-start gap-4" onClick={() => h.setMode('manual')}>
          <FileCheck className="w-8 h-8 text-primary" />
          <div className="text-left"><p className="font-medium">Ввести вручную</p><p className="text-sm text-muted-foreground">Заполнить все данные самостоятельно</p></div>
          <ArrowRight className="w-5 h-5 ml-auto text-muted-foreground" />
        </Button>
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="space-y-4">
      {h.mode === 'invoice' && (
        <div className="space-y-2">
          <Label>Счёт-основание</Label>
          <Select value={h.selectedInvoiceId} onValueChange={h.setSelectedInvoiceId}>
            <SelectTrigger><SelectValue placeholder="Выберите счёт" /></SelectTrigger>
            <SelectContent>{h.invoices.map((inv) => <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>)}</SelectContent>
          </Select>
          {h.selectedInvoice && <p className="text-xs text-muted-foreground">Данные из счёта подгружены автоматически</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Номер акта</Label><Input value={h.actNumber} onChange={(e) => h.setActNumber(e.target.value)} /></div>
        <div className="space-y-2"><Label>Дата акта</Label><Input type="date" value={h.actDate} onChange={(e) => h.setActDate(e.target.value)} /></div>
      </div>
      {h.mode === 'manual' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>№ счёта (опционально)</Label><Input value={h.contractNumber} onChange={(e) => h.setContractNumber(e.target.value)} placeholder="SCH-2025-01-001" /></div>
          <div className="space-y-2"><Label>Дата счёта</Label><Input type="date" value={h.contractDate} onChange={(e) => h.setContractDate(e.target.value)} /></div>
        </div>
      )}
      {!preselectedCompany && (
        <div className="space-y-2">
          <Label>Компания-заказчик</Label>
          <Select value={h.selectedCompanyId} onValueChange={h.setSelectedCompanyId}>
            <SelectTrigger><SelectValue placeholder="Выберите компанию" /></SelectTrigger>
            <SelectContent>{h.companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Курс</Label>
        <Select value={h.selectedCourseId} onValueChange={h.setSelectedCourseId}>
          <SelectTrigger><SelectValue placeholder="Выберите курс" /></SelectTrigger>
          <SelectContent>{h.courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Кол-во учеников</Label><Input type="number" min="1" value={h.studentsCount} onChange={(e) => h.setStudentsCount(e.target.value)} /></div>
        <div className="space-y-2"><Label>Цена за 1 ученика (₽)</Label><Input type="number" min="0" step="0.01" value={h.price} onChange={(e) => h.setPrice(e.target.value)} placeholder="0.00" /></div>
      </div>
      {h.price && h.studentsCount && (
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <span className="text-sm text-muted-foreground">Итого: </span>
          <span className="font-bold text-lg">{h.formatPrice(String(parseFloat(h.price || "0") * parseInt(h.studentsCount || "1")))} ₽</span>
        </div>
      )}
      <div className="flex gap-2 pt-4">
        {h.mode === 'invoice' && <Button variant="ghost" onClick={() => { h.setMode('choosing'); h.setSelectedInvoiceId(""); }} className="px-3">Назад</Button>}
        <Button variant="outline" onClick={h.openPreview} disabled={!h.selectedCourseId || !h.price} className="flex-1"><Eye className="w-4 h-4 mr-2" />Предпросмотр</Button>
        {onSave && <Button onClick={() => h.handleSave(onSave, onClose)} disabled={h.isSaving || !h.selectedCourseId || !h.price} className="flex-1">{h.isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}Сохранить</Button>}
      </div>
    </div>
  );

  const renderPreview = () => (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden bg-white" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <iframe srcDoc={h.previewHtml} className="w-full h-[400px] border-0" title="Предпросмотр акта" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={() => h.setMode(h.invoices.length > 0 && h.selectedInvoiceId ? 'invoice' : 'manual')} className="px-3">Назад</Button>
        <Button variant="outline" onClick={h.handleDownloadDOC} className="flex-1"><Download className="w-4 h-4 mr-2" />Скачать DOC</Button>
        <Button variant="outline" onClick={h.handleGenerate} disabled={h.isGenerating} className="flex-1">{h.isGenerating ? <SigmaSpinner size="sm" className="mr-2" /> : <Printer className="w-4 h-4 mr-2" />}Печать</Button>
        {onSave && <Button onClick={() => h.handleSave(onSave, onClose)} disabled={h.isSaving} className="flex-1">{h.isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}Сохранить</Button>}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileCheck className="w-5 h-5 text-green-500" />Создание акта</DialogTitle>
          <DialogDescription>
            {h.mode === 'choosing' || h.mode === null ? "Выберите способ создания акта" : h.mode === 'preview' ? "Проверьте данные перед сохранением" : "Заполните данные для формирования акта выполненных работ"}
          </DialogDescription>
        </DialogHeader>
        {h.isLoading ? (
          <div className="flex items-center justify-center py-8"><SigmaSpinner /></div>
        ) : (
          <>
            {(h.mode === 'choosing' || h.mode === null) && h.invoices.length > 0 && renderModeSelection()}
            {(h.mode === 'invoice' || h.mode === 'manual') && renderForm()}
            {h.mode === 'preview' && renderPreview()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
