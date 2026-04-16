import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileCheck, Eye, Download, User, Building2, Search, CheckCircle2, Save, History, Trash2, FileText, UserCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentPreview } from "./DocumentPreview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useConsentGenerator } from "@/hooks/useConsentGenerator";

interface ConsentGeneratorProps { organizationId: string; organizationName: string; onGenerated?: (url: string) => void; }

export function ConsentGenerator({ organizationId, organizationName }: ConsentGeneratorProps) {
  const h = useConsentGenerator(organizationId, organizationName);

  return (
    <div className="space-y-6">
      <Tabs value={h.consentType} onValueChange={(v) => h.setConsentType(v as "individual" | "organization")}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="individual" className="rounded-xl gap-2"><User className="w-4 h-4" />Для физ. лица</TabsTrigger>
          <TabsTrigger value="organization" className="rounded-xl gap-2"><Building2 className="w-4 h-4" />Для организации</TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="space-y-4 pt-4">
          <StudentSelector h={h} />
          <div className="space-y-2"><Label>ФИО полностью</Label><Input placeholder="Иванов Иван Иванович" value={h.fullName} onChange={(e) => h.setFullName(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>Паспортные данные</Label><Input placeholder="1234 567890, выдан УФМС ..." value={h.passportData} onChange={(e) => h.setPassportData(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>Адрес регистрации/проживания</Label><Input placeholder="г. Москва, ул. Примерная, д. 1, кв. 1" value={h.address} onChange={(e) => h.setAddress(e.target.value)} className="rounded-xl" /></div>
        </TabsContent>

        <TabsContent value="organization" className="space-y-4 pt-4">
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Building2 className="w-4 h-4" />Автозаполнение по ИНН</div>
            <div className="flex gap-2">
              <Input placeholder="Введите ИНН организации" value={h.companyInn} onChange={(e) => h.setCompanyInn(e.target.value.replace(/\D/g, "").slice(0, 12))} className="rounded-xl flex-1" />
              <Button variant="outline" className="rounded-xl gap-2" onClick={h.handleSearchByInn} disabled={h.isSearchingDadata || h.companyInn.length < 10}>{h.isSearchingDadata ? <SigmaSpinner size="sm" /> : <Search className="w-4 h-4" />}Найти</Button>
            </div>
            {h.dadataCompanyInfo && <div className="flex items-center gap-2 text-sm text-sigma-green"><CheckCircle2 className="w-4 h-4" />Найдено: {h.dadataCompanyInfo.shortName || h.dadataCompanyInfo.name}</div>}
          </div>
          <div className="space-y-2"><Label>Наименование организации</Label><Input placeholder='ООО «Название»' value={h.companyName} onChange={(e) => h.setCompanyName(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>ФИО директора</Label><Input placeholder="Петров Петр Петрович" value={h.companyDirector} onChange={(e) => h.setCompanyDirector(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>Адрес организации</Label><Input placeholder="г. Москва, ул. Примерная, д. 1" value={h.companyAddress} onChange={(e) => h.setCompanyAddress(e.target.value)} className="rounded-xl" /></div>
        </TabsContent>
      </Tabs>

      <Accordion type="single" collapsible>
        <AccordionItem value="preview" className="border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline gap-2"><span className="flex items-center gap-2"><Eye className="w-4 h-4" />Предпросмотр согласия</span></AccordionTrigger>
          <AccordionContent>
            <DocumentPreview type="consent" data={{ studentName: h.consentType === "individual" ? (h.fullName || undefined) : (h.companyDirector || undefined), orgName: h.organization?.name || undefined, inn: h.organization?.inn || undefined, ogrn: h.organization?.ogrn || undefined, address: h.organization?.legal_address || undefined }} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" className="rounded-xl gap-2 flex-1" onClick={() => h.setShowPreview(true)}><Eye className="w-4 h-4" />Предпросмотр</Button>
        <Button variant="outline" className="rounded-xl gap-2 flex-1" onClick={h.handleDownload}><Download className="w-4 h-4" />Скачать</Button>
        <Button className="btn-gradient rounded-xl gap-2 flex-1" onClick={h.handleSaveToDatabase} disabled={h.isSaving}>{h.isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}Сохранить</Button>
      </div>

      {h.savedConsents.length > 0 && <SavedConsentsSection h={h} />}

      <Dialog open={h.showPreview} onOpenChange={h.setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><FileCheck className="w-5 h-5" />Предпросмотр согласия на обработку ПД</DialogTitle></DialogHeader>
          <div className="bg-white p-8 rounded-xl border"><div className="prose prose-sm max-w-none" style={{ fontFamily: "'Times New Roman', serif" }} dangerouslySetInnerHTML={{ __html: h.generateConsentHTML() }} /></div>
          <div className="flex justify-end gap-2 pt-4"><Button variant="outline" onClick={() => h.setShowPreview(false)} className="rounded-xl">Закрыть</Button><Button onClick={h.handlePrint} className="btn-gradient rounded-xl gap-2"><Download className="w-4 h-4" />Печать</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!h.selectedConsent} onOpenChange={(open) => !open && h.setSelectedConsent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><FileText className="w-5 h-5" />Сохранённое согласие{h.selectedConsent && <span className="text-sm font-normal text-muted-foreground ml-2">от {h.formatConsentDate(h.selectedConsent.created_at)}</span>}</DialogTitle></DialogHeader>
          {h.selectedConsent && (
            <>
              <div className="bg-white p-8 rounded-xl border"><div className="prose prose-sm max-w-none" style={{ fontFamily: "'Times New Roman', serif" }} dangerouslySetInnerHTML={{ __html: h.selectedConsent.content_html }} /></div>
              <div className="flex justify-between gap-2 pt-4">
                <Button variant="destructive" onClick={() => h.handleDeleteConsent(h.selectedConsent!.id)} className="rounded-xl gap-2"><Trash2 className="w-4 h-4" />Удалить</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => h.setSelectedConsent(null)} className="rounded-xl">Закрыть</Button>
                  <Button onClick={() => { const pw = window.open("", "_blank"); if (pw && h.selectedConsent) { pw.document.write(h.selectedConsent.content_html); pw.document.close(); pw.print(); } }} className="btn-gradient rounded-xl gap-2"><Download className="w-4 h-4" />Печать</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentSelector({ h }: { h: ReturnType<typeof useConsentGenerator> }) {
  return (
    <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium"><UserCheck className="w-4 h-4" />Привязать к ученику (необязательно)</div>
      <Select value={h.selectedStudentId} onValueChange={h.handleStudentSelect}>
        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите ученика для привязки" /></SelectTrigger>
        <SelectContent>
          <div className="p-2"><Input placeholder="Поиск ученика..." value={h.studentSearchQuery} onChange={(e) => h.setStudentSearchQuery(e.target.value)} className="rounded-lg mb-2" /></div>
          {h.students.filter(s => s.full_name?.toLowerCase().includes(h.studentSearchQuery.toLowerCase()) || s.email?.toLowerCase().includes(h.studentSearchQuery.toLowerCase())).slice(0, 50).map((student) => (
            <SelectItem key={student.user_id} value={student.user_id}><div className="flex flex-col"><span>{student.full_name || "Без имени"}</span><span className="text-xs text-muted-foreground">{student.email}</span></div></SelectItem>
          ))}
          {h.students.length === 0 && <div className="p-2 text-sm text-muted-foreground text-center">Нет учеников</div>}
        </SelectContent>
      </Select>
      {h.selectedStudentId && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-sigma-green"><CheckCircle2 className="w-4 h-4" />Выбран: {h.students.find(s => s.user_id === h.selectedStudentId)?.full_name}</div>
          <Button variant="ghost" size="sm" onClick={() => h.setSelectedStudentId("")} className="text-xs">Отвязать</Button>
        </div>
      )}
    </div>
  );
}

function SavedConsentsSection({ h }: { h: ReturnType<typeof useConsentGenerator> }) {
  return (
    <div className="border-t border-border pt-4">
      <Button variant="ghost" className="w-full justify-between rounded-xl" onClick={() => h.setShowHistory(!h.showHistory)}>
        <span className="flex items-center gap-2"><History className="w-4 h-4" />Сохранённые согласия ({h.savedConsents.length})</span>
        <span className={`transition-transform ${h.showHistory ? "rotate-180" : ""}`}>▼</span>
      </Button>
      {h.showHistory && (
        <ScrollArea className="h-[200px] mt-2 rounded-xl border border-border">
          <div className="p-2 space-y-2">
            {h.savedConsents.map((consent) => (
              <div key={consent.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${consent.consent_type === "individual" ? "bg-primary/10" : "bg-accent/10"}`}>
                    {consent.consent_type === "individual" ? <User className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-accent" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{consent.consent_type === "individual" ? consent.full_name || "Физ. лицо" : consent.company_name || "Организация"}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{h.formatConsentDate(consent.created_at)}</span>
                      {consent.student_name && <span className="flex items-center gap-1 text-primary"><UserCheck className="w-3 h-3" />{consent.student_name}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => h.setSelectedConsent(consent)}><Eye className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => h.handleDeleteConsent(consent.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
