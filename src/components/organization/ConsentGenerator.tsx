import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { FileCheck, Eye, Download, User, Building2, Search, CheckCircle2, Save, History, Trash2, FileText, UserCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentPreview } from "./DocumentPreview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ConsentGeneratorProps {
  organizationId: string;
  organizationName: string;
  onGenerated?: (url: string) => void;
}

interface Organization {
  name: string;
  inn: string | null;
  ogrn: string | null;
  legal_address: string | null;
  director_name: string | null;
  director_position: string | null;
}

interface DadataCompany {
  name: string;
  fullName: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  address: string;
  management: string;
  status: string;
  type: string;
  opf: string;
}

interface SavedConsent {
  id: string;
  consent_type: "individual" | "organization";
  full_name: string | null;
  passport_data: string | null;
  address: string | null;
  company_name: string | null;
  company_inn: string | null;
  company_director: string | null;
  company_address: string | null;
  content_html: string;
  created_at: string;
  student_user_id: string | null;
  student_name?: string | null;
}

interface Student {
  user_id: string;
  full_name: string;
  email: string;
}

const DEFAULT_CONSENT_TEMPLATE = `СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ

Я, {{full_name}}, паспорт: {{passport_data}}, адрес регистрации/проживания: {{address}}, настоящим, в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных», даю согласие {{org_name}}, ИНН {{org_inn}}, ОГРН {{org_ogrn}}, адрес: {{org_address}} (далее — Оператор), на обработку моих персональных данных.

Цель обработки персональных данных:
заключение и исполнение договора об оказании платных образовательных услуг; организация образовательного процесса; ведение учета обучающихся; обеспечение доступа к электронной информационно-образовательной среде (ЭИОС); проведение текущего контроля и итоговой аттестации; оформление, учет и выдача документов об обучении и (или) о квалификации; исполнение требований законодательства РФ.

Перечень персональных данных, на обработку которых дается согласие:
- фамилия, имя, отчество;
- дата и место рождения;
- паспортные данные или данные иного документа, удостоверяющего личность;
- адрес регистрации и (или) проживания;
- контактные данные (телефон, адрес электронной почты);
- сведения об образовании, квалификации, месте работы (при необходимости);
- данные об успеваемости, результатах текущего контроля и итоговой аттестации;
- идентификаторы в ЭИОС, данные об активности в ЭИОС;
- изображение (фото/видео) при использовании ЭО/ДОТ и прокторинга (при применимости).

С персональными данными могут совершаться следующие действия:
сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), использование, передача (в случаях, предусмотренных законодательством РФ), обезличивание, блокирование, удаление, уничтожение.

Обработка персональных данных может осуществляться как с использованием средств автоматизации, так и без использования таких средств.

Настоящее согласие действует с даты его подписания и до достижения целей обработки персональных данных либо до отзыва согласия, если иное не предусмотрено законодательством РФ.

Согласие может быть отозвано мной в любое время путем направления письменного уведомления Оператору. Отзыв согласия не влияет на законность обработки персональных данных, осуществленной до момента отзыва.

Мне разъяснены мои права как субъекта персональных данных, предусмотренные ст. 14 Федерального закона № 152-ФЗ.

Дата: {{consent_date}}

_________________________ / {{full_name}} /
        (подпись)`;

export function ConsentGenerator({
  organizationId,
  organizationName,
  onGenerated }: ConsentGeneratorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [consentType, setConsentType] = useState<"individual" | "organization">("individual");
  
  // Saved consents
  const [savedConsents, setSavedConsents] = useState<SavedConsent[]>([]);
  const [isLoadingConsents, setIsLoadingConsents] = useState(false);
  const [selectedConsent, setSelectedConsent] = useState<SavedConsent | null>(null);
  
  // Students
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  
  // Individual fields
  const [fullName, setFullName] = useState("");
  const [passportData, setPassportData] = useState("");
  const [address, setAddress] = useState("");
  
  // Organization fields (for company consent)
  const [companyName, setCompanyName] = useState("");
  const [companyInn, setCompanyInn] = useState("");
  const [companyDirector, setCompanyDirector] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  
  // DaData search state
  const [isSearchingDadata, setIsSearchingDadata] = useState(false);
  const [dadataCompanyInfo, setDadataCompanyInfo] = useState<DadataCompany | null>(null);

  useEffect(() => {
    loadOrganization();
    loadSavedConsents();
    loadStudents();
  }, [organizationId]);

  const loadSavedConsents = async () => {
    setIsLoadingConsents(true);
    try {
      const { data, error } = await supabase
        .from("consent_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Load student names for consents with student_user_id
      const consentsWithStudents = await Promise.all(
        (data || []).map(async (consent: any) => {
          if (consent.student_user_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", consent.student_user_id)
              .single();
            return { ...consent, student_name: profile?.full_name || null };
          }
          return consent;
        })
      );
      
      setSavedConsents(consentsWithStudents as SavedConsent[]);
    } catch (error) {
      console.error("Error loading consents:", error);
    } finally {
      setIsLoadingConsents(false);
    }
  };

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId)
        .order("full_name");

      if (error) throw error;
      setStudents((data || []) as Student[]);
    } catch (error) {
      console.error("Error loading students:", error);
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const student = students.find(s => s.user_id === studentId);
    if (student && consentType === "individual") {
      setFullName(student.full_name || "");
    }
  };

  const loadOrganization = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("name, inn, ogrn, legal_address, director_name, director_position")
        .eq("id", organizationId)
        .single();

      if (error) throw error;
      setOrganization(data);
    } catch (error) {
      console.error("Error loading organization:", error);
    }
  };

  const handleSearchByInn = async () => {
    if (companyInn.length < 10) {
      toast.error("Введите корректный ИНН (10 или 12 цифр)");
      return;
    }

    setIsSearchingDadata(true);
    try {
      const { data, error } = await safeInvoke<any>('dadata-company', {
        body: { inn: companyInn }
      });

      if (error) throw error;

      if (data.success && data.company) {
        setDadataCompanyInfo(data.company);
        setCompanyName(data.company.shortName || data.company.name);
        setCompanyDirector(data.company.management || "");
        setCompanyAddress(data.company.address || "");
        toast.success("Данные компании найдены");
      } else {
        setDadataCompanyInfo(null);
        toast.error(data.message || "Компания не найдена");
      }
    } catch (error) {
      console.error("DaData search error:", error);
      toast.error("Ошибка поиска по ИНН");
      setDadataCompanyInfo(null);
    } finally {
      setIsSearchingDadata(false);
    }
  };

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric" });
  };

  const generateConsentContent = () => {
    if (!organization) return "";

    let content = DEFAULT_CONSENT_TEMPLATE;

    // Organization data
    content = content.replace(/\{\{org_name\}\}/g, organization.name || organizationName);
    content = content.replace(/\{\{org_inn\}\}/g, organization.inn || "_____________");
    content = content.replace(/\{\{org_ogrn\}\}/g, organization.ogrn || "_____________");
    content = content.replace(/\{\{org_address\}\}/g, organization.legal_address || "_____________");
    content = content.replace(/\{\{consent_date\}\}/g, formatDate());

    if (consentType === "individual") {
      content = content.replace(/\{\{full_name\}\}/g, fullName || "___________________________________");
      content = content.replace(/\{\{passport_data\}\}/g, passportData || "_________________________________");
      content = content.replace(/\{\{address\}\}/g, address || "_________________________________");
    } else {
      // For organization consent
      content = content.replace(
        "Я, {{full_name}}, паспорт: {{passport_data}}, адрес регистрации/проживания: {{address}}",
        `${companyName || "_________________"}, ИНН ${companyInn || "_________"}, в лице ${companyDirector || "_______________"}, адрес: ${companyAddress || "_________________"}`
      );
      content = content.replace(/\{\{full_name\}\}/g, companyDirector || "_______________");
    }

    return content;
  };

  const generateConsentHTML = () => {
    const content = generateConsentContent();
    const lines = content.split("\n");
    
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 2cm; size: A4; }
    body { 
      font-family: 'Times New Roman', serif; 
      font-size: 12pt; 
      line-height: 1.5;
      max-width: 21cm;
      margin: 0 auto;
      padding: 2cm;
    }
    h1 { 
      text-align: center; 
      font-size: 14pt; 
      margin-bottom: 20pt;
      font-weight: bold;
    }
    p { 
      text-align: justify; 
      margin-bottom: 6pt;
      text-indent: 1.25cm;
    }
    ul { 
      margin-left: 2cm; 
      margin-bottom: 12pt;
    }
    li { margin-bottom: 4pt; }
    .signature-block {
      margin-top: 30pt;
      text-align: left;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  ${lines.map((line, idx) => {
    if (idx === 0) return `<h1>${line}</h1>`;
    if (line.startsWith("- ")) return `<li>${line.substring(2)}</li>`;
    if (line.trim() === "") return "";
    return `<p>${line}</p>`;
  }).join("\n")}
</body>
</html>`;
  };

  const handlePreview = () => {
    setShowPreview(true);
  };

  const handleDownload = () => {
    const html = generateConsentHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `consent_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Согласие скачано");
  };

  const handlePrint = () => {
    const html = generateConsentHTML();
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleSaveToDatabase = async () => {
    const html = generateConsentHTML();
    
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const insertData = {
        organization_id: organizationId,
        consent_type: consentType,
        full_name: consentType === "individual" ? fullName || null : null,
        passport_data: consentType === "individual" ? passportData || null : null,
        address: consentType === "individual" ? address || null : null,
        company_name: consentType === "organization" ? companyName || null : null,
        company_inn: consentType === "organization" ? companyInn || null : null,
        company_director: consentType === "organization" ? companyDirector || null : null,
        company_address: consentType === "organization" ? companyAddress || null : null,
        content_html: html,
        created_by: user?.id || null,
        student_user_id: selectedStudentId || null };

      const { error } = await supabase
        .from("consent_documents")
        .insert(insertData);

      if (error) throw error;

      toast.success("Согласие сохранено в базу данных");
      loadSavedConsents();
      
      // Clear form after saving
      setSelectedStudentId("");
      if (consentType === "individual") {
        setFullName("");
        setPassportData("");
        setAddress("");
      } else {
        setCompanyName("");
        setCompanyInn("");
        setCompanyDirector("");
        setCompanyAddress("");
        setDadataCompanyInfo(null);
      }
    } catch (error) {
      console.error("Error saving consent:", error);
      toast.error("Ошибка сохранения согласия");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConsent = async (id: string) => {
    try {
      const { error } = await supabase
        .from("consent_documents")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Согласие удалено");
      loadSavedConsents();
      setSelectedConsent(null);
    } catch (error) {
      console.error("Error deleting consent:", error);
      toast.error("Ошибка удаления согласия");
    }
  };

  const handleViewSavedConsent = (consent: SavedConsent) => {
    setSelectedConsent(consent);
  };

  const formatConsentDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit" });
  };

  return (
    <div className="space-y-6">
      <Tabs value={consentType} onValueChange={(v) => setConsentType(v as "individual" | "organization")}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="individual" className="rounded-xl gap-2">
            <User className="w-4 h-4" />
            Для физ. лица
          </TabsTrigger>
          <TabsTrigger value="organization" className="rounded-xl gap-2">
            <Building2 className="w-4 h-4" />
            Для организации
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="space-y-4 pt-4">
          {/* Student Selection */}
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserCheck className="w-4 h-4" />
              Привязать к ученику (необязательно)
            </div>
            <Select value={selectedStudentId} onValueChange={handleStudentSelect}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Выберите ученика для привязки" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Поиск ученика..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    className="rounded-lg mb-2"
                  />
                </div>
                {students
                  .filter(s => 
                    s.full_name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                    s.email?.toLowerCase().includes(studentSearchQuery.toLowerCase())
                  )
                  .slice(0, 50)
                  .map((student) => (
                    <SelectItem key={student.user_id} value={student.user_id}>
                      <div className="flex flex-col">
                        <span>{student.full_name || "Без имени"}</span>
                        <span className="text-xs text-muted-foreground">{student.email}</span>
                      </div>
                    </SelectItem>
                  ))}
                {students.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    Нет учеников
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedStudentId && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-sigma-green">
                  <CheckCircle2 className="w-4 h-4" />
                  Выбран: {students.find(s => s.user_id === selectedStudentId)?.full_name}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStudentId("")}
                  className="text-xs"
                >
                  Отвязать
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>ФИО полностью</Label>
            <Input
              placeholder="Иванов Иван Иванович"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Паспортные данные</Label>
            <Input
              placeholder="1234 567890, выдан УФМС ..."
              value={passportData}
              onChange={(e) => setPassportData(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Адрес регистрации/проживания</Label>
            <Input
              placeholder="г. Москва, ул. Примерная, д. 1, кв. 1"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </TabsContent>

        <TabsContent value="organization" className="space-y-4 pt-4">
          {/* INN Search Section */}
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="w-4 h-4" />
              Автозаполнение по ИНН
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Введите ИНН организации"
                value={companyInn}
                onChange={(e) => setCompanyInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                className="rounded-xl flex-1"
              />
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                onClick={handleSearchByInn}
                disabled={isSearchingDadata || companyInn.length < 10}
              >
                {isSearchingDadata ? (
                  <SigmaSpinner size="sm" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Найти
              </Button>
            </div>
            {dadataCompanyInfo && (
              <div className="flex items-center gap-2 text-sm text-sigma-green">
                <CheckCircle2 className="w-4 h-4" />
                Найдено: {dadataCompanyInfo.shortName || dadataCompanyInfo.name}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Наименование организации</Label>
            <Input
              placeholder="ООО «Название»"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>ФИО директора</Label>
            <Input
              placeholder="Петров Петр Петрович"
              value={companyDirector}
              onChange={(e) => setCompanyDirector(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Адрес организации</Label>
            <Input
              placeholder="г. Москва, ул. Примерная, д. 1"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </TabsContent>
      </Tabs>

      <Accordion type="single" collapsible>
        <AccordionItem value="preview" className="border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline gap-2">
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Предпросмотр согласия
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <DocumentPreview
              type="consent"
              data={{
                studentName: consentType === "individual" ? (fullName || undefined) : (companyDirector || undefined),
                orgName: organization?.name || undefined,
                inn: organization?.inn || undefined,
                ogrn: organization?.ogrn || undefined,
                address: organization?.legal_address || undefined }}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          className="rounded-xl gap-2 flex-1"
          onClick={handlePreview}
        >
          <Eye className="w-4 h-4" />
          Предпросмотр
        </Button>
        <Button
          variant="outline"
          className="rounded-xl gap-2 flex-1"
          onClick={handleDownload}
        >
          <Download className="w-4 h-4" />
          Скачать
        </Button>
        <Button
          className="btn-gradient rounded-xl gap-2 flex-1"
          onClick={handleSaveToDatabase}
          disabled={isSaving}
        >
          {isSaving ? (
            <SigmaSpinner size="sm" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Сохранить
        </Button>
      </div>

      {/* Saved Consents History */}
      {savedConsents.length > 0 && (
        <div className="border-t border-border pt-4">
          <Button
            variant="ghost"
            className="w-full justify-between rounded-xl"
            onClick={() => setShowHistory(!showHistory)}
          >
            <span className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Сохранённые согласия ({savedConsents.length})
            </span>
            <span className={`transition-transform ${showHistory ? "rotate-180" : ""}`}>▼</span>
          </Button>
          
          {showHistory && (
            <ScrollArea className="h-[200px] mt-2 rounded-xl border border-border">
              <div className="p-2 space-y-2">
                {savedConsents.map((consent) => (
                  <div
                    key={consent.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        consent.consent_type === "individual" ? "bg-primary/10" : "bg-accent/10"
                      }`}>
                        {consent.consent_type === "individual" ? (
                          <User className="w-4 h-4 text-primary" />
                        ) : (
                          <Building2 className="w-4 h-4 text-accent" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {consent.consent_type === "individual" 
                            ? consent.full_name || "Физ. лицо"
                            : consent.company_name || "Организация"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatConsentDate(consent.created_at)}</span>
                          {consent.student_name && (
                            <span className="flex items-center gap-1 text-primary">
                              <UserCheck className="w-3 h-3" />
                              {consent.student_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleViewSavedConsent(consent)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteConsent(consent.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileCheck className="w-5 h-5" />
              Предпросмотр согласия на обработку ПД
            </DialogTitle>
          </DialogHeader>
          <div className="bg-white p-8 rounded-xl border">
            <div
              className="prose prose-sm max-w-none"
              style={{ fontFamily: "'Times New Roman', serif" }}
              dangerouslySetInnerHTML={{ __html: generateConsentHTML() }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)} className="rounded-xl">
              Закрыть
            </Button>
            <Button onClick={handlePrint} className="btn-gradient rounded-xl gap-2">
              <Download className="w-4 h-4" />
              Печать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Saved Consent Dialog */}
      <Dialog open={!!selectedConsent} onOpenChange={(open) => !open && setSelectedConsent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Сохранённое согласие
              {selectedConsent && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  от {formatConsentDate(selectedConsent.created_at)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedConsent && (
            <>
              <div className="bg-white p-8 rounded-xl border">
                <div
                  className="prose prose-sm max-w-none"
                  style={{ fontFamily: "'Times New Roman', serif" }}
                  dangerouslySetInnerHTML={{ __html: selectedConsent.content_html }}
                />
              </div>
              <div className="flex justify-between gap-2 pt-4">
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteConsent(selectedConsent.id)}
                  className="rounded-xl gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedConsent(null)} className="rounded-xl">
                    Закрыть
                  </Button>
                  <Button
                    onClick={() => {
                      const printWindow = window.open("", "_blank");
                      if (printWindow && selectedConsent) {
                        printWindow.document.write(selectedConsent.content_html);
                        printWindow.document.close();
                        printWindow.print();
                      }
                    }}
                    className="btn-gradient rounded-xl gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Печать
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
