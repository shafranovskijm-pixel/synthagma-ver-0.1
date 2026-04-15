import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Calendar, Printer, Save, Eye, ArrowLeft, Download, Plus, Trash2, User } from "lucide-react";
import { useContractGenerator, type CounterpartyType } from "@/hooks/useContractGenerator";

interface Company {
  id: string; name: string; inn: string | null; kpp: string | null; ogrn: string | null; address: string | null; director: string | null;
}
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
    selectedCompanyId, setSelectedCompanyId,
    counterpartyType, setCounterpartyType,
    individualData, setIndividualData,
    selectedPrograms, addProgram, removeProgram, updateProgram,
    totalPrice, hasValidPrograms,
    contractNumber, setContractNumber, contractDate, setContractDate,
    serviceStartDate, setServiceStartDate, serviceEndDate, setServiceEndDate,
    additionalTerms, setAdditionalTerms,
    selectedCompany, effectiveCounterparty, formatPrice, handleGenerate, handleDownloadDOC, handleSaveContract, handlePreview } = useContractGenerator(props);

  if (showPreview) {
    return (
      <Dialog open={props.isOpen} onOpenChange={props.onClose}>
        <DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle className="flex gap-2"><Eye className="w-5 h-5" />Предпросмотр договора</DialogTitle><DialogDescription>Проверьте данные перед сохранением</DialogDescription></DialogHeader>
          <div className="flex-1 overflow-hidden"><div className="border rounded-lg overflow-hidden bg-white h-[60vh]"><iframe srcDoc={previewHtml} className="w-full h-full border-0" title="Предпросмотр" /></div></div>
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setShowPreview(false)}><ArrowLeft className="w-4 h-4 mr-2" />Назад</Button>
            {props.onSave && <Button variant="outline" className="flex-1" onClick={handleSaveContract} disabled={isSaving}>{isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4 mr-2" />}Сохранить</Button>}
            <Button variant="outline" className="flex-1" onClick={handleDownloadDOC}><Download className="w-4 h-4 mr-2" />Скачать DOC</Button>
            <Button className="btn-gradient flex-1" onClick={handleGenerate} disabled={isGenerating}>{isGenerating ? <SigmaSpinner size="sm" /> : <Printer className="w-4 h-4 mr-2" />}Печать</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle className="flex gap-2"><div className="text-primary">📄</div>Генерация договора</DialogTitle><DialogDescription>Заполните данные для формирования</DialogDescription></DialogHeader>
        {isLoading ? <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div> : (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Номер договора</Label><Input value={contractNumber} onChange={e => setContractNumber(e.target.value)} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Дата</Label><Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} className="rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Дата начала обучения</Label><Input type="date" value={serviceStartDate} onChange={e => setServiceStartDate(e.target.value)} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Дата окончания обучения</Label><Input type="date" value={serviceEndDate} onChange={e => setServiceEndDate(e.target.value)} className="rounded-xl" /></div>
            </div>

            {/* Counterparty type selector */}
            {!props.preselectedCompany && (
              <div className="space-y-2">
                <Label>Тип заказчика</Label>
                <div className="flex gap-2">
                  <Button
                    variant={counterpartyType === 'company' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 rounded-xl gap-2"
                    onClick={() => setCounterpartyType('company')}
                  >
                    <Building2 className="w-4 h-4" />
                    Юр. лицо / ИП
                  </Button>
                  <Button
                    variant={counterpartyType === 'individual' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 rounded-xl gap-2"
                    onClick={() => setCounterpartyType('individual')}
                  >
                    <User className="w-4 h-4" />
                    Физ. лицо
                  </Button>
                </div>
              </div>
            )}

            {/* Company selector */}
            {props.preselectedCompany ? (
              <div className="space-y-2"><Label className="flex gap-2"><Building2 className="w-4 h-4" />Заказчик</Label><div className="bg-secondary/50 rounded-xl p-3"><p className="font-medium">{props.preselectedCompany.name}</p>{props.preselectedCompany.inn && <p className="text-sm text-muted-foreground">ИНН: {props.preselectedCompany.inn}</p>}</div></div>
            ) : counterpartyType === 'company' ? (
              <div className="space-y-2">
                <Label className="flex gap-2"><Building2 className="w-4 h-4" />Заказчик (компания) *</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите компанию" /></SelectTrigger><SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name} {c.inn && `(ИНН: ${c.inn})`}</SelectItem>)}</SelectContent></Select>
              </div>
            ) : (
              <div className="space-y-3 border border-border rounded-xl p-4">
                <Label className="flex gap-2 text-sm font-medium"><User className="w-4 h-4" />Данные физического лица</Label>
                <div className="space-y-2">
                  <Label className="text-xs">ФИО *</Label>
                  <Input
                    value={individualData.fullName}
                    onChange={e => setIndividualData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Иванов Иван Иванович"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Паспортные данные</Label>
                  <Input
                    value={individualData.passport}
                    onChange={e => setIndividualData(prev => ({ ...prev, passport: e.target.value }))}
                    placeholder="серия 1234 № 567890, выдан ..."
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Адрес проживания</Label>
                  <Input
                    value={individualData.address}
                    onChange={e => setIndividualData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="г. Москва, ул. Примерная, д. 1, кв. 1"
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Телефон</Label>
                    <Input
                      value={individualData.phone}
                      onChange={e => setIndividualData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+7 (999) 123-45-67"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">E-mail</Label>
                    <Input
                      value={individualData.email}
                      onChange={e => setIndividualData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="example@mail.ru"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Programs list */}
            <div className="space-y-3">
              <Label className="flex gap-2"><Calendar className="w-4 h-4" />Программы *</Label>
              {selectedPrograms.map((program, index) => (
                <div key={index} className="border border-border rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Программа {index + 1}</span>
                    {selectedPrograms.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeProgram(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <Select value={program.courseId} onValueChange={v => updateProgram(index, { courseId: v })}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger>
                    <SelectContent>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
                  </Select>
                  {(() => {
                    const course = courses.find(c => c.id === program.courseId);
                    return course?.frdo_duration_hours ? (
                      <div className="text-xs text-muted-foreground">Объём: {course.frdo_duration_hours} ак. часов</div>
                    ) : null;
                  })()}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Кол-во чел.</Label>
                      <Input type="number" min="1" value={program.studentsCount} onChange={e => updateProgram(index, { studentsCount: e.target.value })} className="rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Цена за 1 чел. *</Label>
                      <Input type="number" min="0" step="0.01" value={program.price} onChange={e => updateProgram(index, { price: e.target.value })} className="rounded-xl" />
                    </div>
                  </div>
                  {program.price && program.studentsCount && (
                    <div className="text-sm text-right text-muted-foreground">
                      Подытог: <span className="font-medium text-foreground">{formatPrice(String((parseFloat(program.price) || 0) * (parseInt(program.studentsCount) || 0)))} ₽</span>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={addProgram}>
                <Plus className="w-4 h-4 mr-2" />Добавить программу
              </Button>
            </div>

            {hasValidPrograms && (
              <div className="bg-secondary/50 rounded-xl p-4 flex justify-between items-center">
                <span className="text-muted-foreground">Итого:</span>
                <span className="text-xl font-bold">{formatPrice(String(totalPrice))} ₽</span>
              </div>
            )}

            <div className="space-y-2"><Label>Доп. условия</Label><Textarea value={additionalTerms} onChange={e => setAdditionalTerms(e.target.value)} className="rounded-xl min-h-[80px]" placeholder="Условия..." /></div>
            <div className="bg-secondary/30 rounded-xl p-4"><p className="text-sm font-medium mb-2">Исполнитель:</p><p className="text-sm text-muted-foreground">{props.orgRequisites.name} • ИНН: {props.orgRequisites.inn}</p>{!props.orgRequisites.inn && <p className="text-xs text-destructive mt-2">⚠️ Заполните реквизиты организации</p>}</div>
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="outline" className="flex-1" onClick={handlePreview} disabled={!effectiveCounterparty || !hasValidPrograms}><Eye className="w-4 h-4 mr-2" />Предпросмотр</Button>
              {props.onSave && <Button variant="outline" className="flex-1" onClick={handleSaveContract} disabled={isSaving || !effectiveCounterparty || !hasValidPrograms}>{isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4 mr-2" />}Сохранить</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
