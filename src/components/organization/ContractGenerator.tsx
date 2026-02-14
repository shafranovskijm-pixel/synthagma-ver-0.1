import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building2, Calendar, Users, Printer, Save, Eye, ArrowLeft, Download } from "lucide-react";
import { useContractGenerator } from "@/hooks/useContractGenerator";

interface Company {
  id: string; name: string; inn: string | null; kpp: string | null; ogrn: string | null; address: string | null; director: string | null;
}
interface Course { id: string; title: string; duration: string | null; }
interface OrgRequisites {
  name: string; inn: string; kpp: string; ogrn: string; legal_address: string; actual_address: string;
  director_name: string; director_position: string; bank_name: string; bank_bik: string; bank_account: string; bank_corr_account: string;
  stamp_url?: string | null; signature_url?: string | null;
}

interface ContractGeneratorProps {
  organizationId: string; isOpen: boolean; onClose: () => void; orgRequisites: OrgRequisites; preselectedCompany?: Company | null;
  onSave?: (html: string, contractNumber: string, companyName: string, courseId: string, amount: number, studentsCount: number, contractDate: string) => Promise<void>;
}

export function ContractGenerator(props: ContractGeneratorProps) {
  const {
    companies, courses, isLoading, isGenerating, isSaving,
    showPreview, setShowPreview, previewHtml,
    selectedCompanyId, setSelectedCompanyId, selectedCourseId, setSelectedCourseId,
    contractNumber, setContractNumber, contractDate, setContractDate,
    studentsCount, setStudentsCount, price, setPrice, additionalTerms, setAdditionalTerms,
    selectedCompany, formatPrice, handleGenerate, handleDownloadDOC, handleSaveContract, handlePreview,
  } = useContractGenerator(props);

  if (showPreview) {
    return (
      <Dialog open={props.isOpen} onOpenChange={props.onClose}>
        <DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle className="flex gap-2"><Eye className="w-5 h-5" />Предпросмотр договора</DialogTitle><DialogDescription>Проверьте данные перед сохранением</DialogDescription></DialogHeader>
          <div className="flex-1 overflow-hidden"><div className="border rounded-lg overflow-hidden bg-white h-[60vh]"><iframe srcDoc={previewHtml} className="w-full h-full border-0" title="Предпросмотр" /></div></div>
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setShowPreview(false)}><ArrowLeft className="w-4 h-4 mr-2" />Назад</Button>
            {props.onSave && <Button variant="outline" className="flex-1" onClick={handleSaveContract} disabled={isSaving}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Сохранить</Button>}
            <Button variant="outline" className="flex-1" onClick={handleDownloadDOC}><Download className="w-4 h-4 mr-2" />Скачать DOC</Button>
            <Button className="btn-gradient flex-1" onClick={handleGenerate} disabled={isGenerating}>{isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}Печать</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle className="flex gap-2"><div className="text-primary">📄</div>Генерация договора</DialogTitle><DialogDescription>Заполните данные для формирования</DialogDescription></DialogHeader>
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Номер договора</Label><Input value={contractNumber} onChange={e => setContractNumber(e.target.value)} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Дата</Label><Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} className="rounded-xl" /></div>
            </div>
            {props.preselectedCompany ? (
              <div className="space-y-2"><Label className="flex gap-2"><Building2 className="w-4 h-4" />Заказчик</Label><div className="bg-secondary/50 rounded-xl p-3"><p className="font-medium">{props.preselectedCompany.name}</p>{props.preselectedCompany.inn && <p className="text-sm text-muted-foreground">ИНН: {props.preselectedCompany.inn}</p>}</div></div>
            ) : (
              <div className="space-y-2">
                <Label className="flex gap-2"><Building2 className="w-4 h-4" />Заказчик *</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите компанию" /></SelectTrigger><SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name} {c.inn && `(ИНН: ${c.inn})`}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="flex gap-2"><Calendar className="w-4 h-4" />Программа *</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger><SelectContent>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="flex gap-2"><Users className="w-4 h-4" />Кол-во чел.</Label><Input type="number" min="1" value={studentsCount} onChange={e => setStudentsCount(e.target.value)} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Цена за 1 чел. *</Label><Input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="rounded-xl" /></div>
            </div>
            {price && studentsCount && <div className="bg-secondary/50 rounded-xl p-4 flex justify-between items-center"><span className="text-muted-foreground">Итого:</span><span className="text-xl font-bold">{formatPrice(String(parseFloat(price) * parseInt(studentsCount)))} ₽</span></div>}
            <div className="space-y-2"><Label>Доп. условия</Label><Textarea value={additionalTerms} onChange={e => setAdditionalTerms(e.target.value)} className="rounded-xl min-h-[80px]" placeholder="Условия..." /></div>
            <div className="bg-secondary/30 rounded-xl p-4"><p className="text-sm font-medium mb-2">Исполнитель:</p><p className="text-sm text-muted-foreground">{props.orgRequisites.name} • ИНН: {props.orgRequisites.inn}</p>{!props.orgRequisites.inn && <p className="text-xs text-destructive mt-2">⚠️ Заполните реквизиты организации</p>}</div>
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="outline" className="flex-1" onClick={handlePreview} disabled={!selectedCompany || !selectedCourseId || !price}><Eye className="w-4 h-4 mr-2" />Предпросмотр</Button>
              {props.onSave && <Button variant="outline" className="flex-1" onClick={handleSaveContract} disabled={isSaving || !selectedCompany || !selectedCourseId || !price}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Сохранить</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
